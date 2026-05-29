#!/usr/bin/env python3
"""
scripts/tools/arc_flash_ieee1584.py

Arc-flash incident energy + arc-flash boundary + PPE category per the FULL
IEEE 1584-2018 empirical model (NOT the simplified 2002 Lee model in
scripts/lib/orchestrator/tools/python/arc_flash_analysis.py).

The 2018 model differs structurally from 2002:
  * Five electrode configurations (VCB, VCBB, HCB, VOA, HOA) instead of
    open-air / box only.
  * Arcing current computed at THREE reference voltages (600 V, 2700 V,
    14300 V) then interpolated to the actual system voltage.
  * Enclosure size correction factor (EES) — incident energy scales with
    box dimensions, not just gap + distance.
  * Arcing-current variation correction factor (VarCf) for the
    "reduced arcing current" sensitivity case (a lower arc current can
    paradoxically yield HIGHER energy because the protective device takes
    longer to clear — so BOTH cases must be evaluated and the worse taken).

Coefficient tables (Table 1, 2, 3, 4, 5, 7) are transcribed verbatim from
IEEE 1584-2018. They were cross-checked against the MIT-licensed reference
implementation LiaungYip/arcflash, which is itself verified against IEEE's
official calculator spreadsheet across 144,000 test cases to within 0.1 %.

Validation (see test_arc_flash_ieee1584.py): reproduces both official
IEEE 1584-2018 Annex D worked examples (D.1 medium-voltage 4.16 kV and
D.2 low-voltage 0.48 kV) to within 0.1 J/cm2 and 1 mm.

JSON contract (stdin -> stdout):
  IN:  { voltage_v, prospective_fault_current_ka, electrode_config,
         gap_mm, working_distance_mm, clearing_time_ms,
         enclosure_height_mm, enclosure_width_mm, enclosure_depth_mm }
  OUT: { incident_energy_cal_cm2, arc_flash_boundary_mm, ppe_category,
         working_distance_mm, arcing_current_ka, clearing_time_ms, ... }

License: tool code proprietary (in-tree). Model: IEEE 1584-2018.
"""
from __future__ import annotations

import json
import math
import sys
import time

# ──────────────────────────────────────────────────────────────────────────
# IEEE 1584-2018 coefficient tables (verbatim from the standard).
# Electrode configs: VCB, VCBB, HCB, VOA, HOA.
# ──────────────────────────────────────────────────────────────────────────

# Table 1 — arcing current Iarc coefficients, keyed by (config, Voc_kV).
# log10(Ia_intermediate) terms k1..k3 ; polynomial term k4..k10.
TABLE_1: dict[tuple[str, float], dict[str, float]] = {
    ("VCB", 0.6): dict(k1=-0.04287, k2=1.035, k3=-0.083, k4=0, k5=0, k6=-4.783e-09, k7=1.962e-06, k8=-0.000229, k9=0.003141, k10=1.092),
    ("VCB", 2.7): dict(k1=0.0065, k2=1.001, k3=-0.024, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729),
    ("VCB", 14.3): dict(k1=0.005795, k2=1.015, k3=-0.011, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729),
    ("VCBB", 0.6): dict(k1=-0.017432, k2=0.98, k3=-0.05, k4=0, k5=0, k6=-5.767e-09, k7=2.524e-06, k8=-0.00034, k9=0.01187, k10=1.013),
    ("VCBB", 2.7): dict(k1=0.002823, k2=0.995, k3=-0.0125, k4=0, k5=-9.204e-11, k6=2.901e-08, k7=-3.262e-06, k8=0.0001569, k9=-0.004003, k10=0.9825),
    ("VCBB", 14.3): dict(k1=0.014827, k2=1.01, k3=-0.01, k4=0, k5=-9.204e-11, k6=2.901e-08, k7=-3.262e-06, k8=0.0001569, k9=-0.004003, k10=0.9825),
    ("HCB", 0.6): dict(k1=0.054922, k2=0.988, k3=-0.11, k4=0, k5=0, k6=-5.382e-09, k7=2.316e-06, k8=-0.000302, k9=0.0091, k10=0.9725),
    ("HCB", 2.7): dict(k1=0.001011, k2=1.003, k3=-0.0249, k4=0, k5=0, k6=4.859e-10, k7=-1.814e-07, k8=-9.128e-06, k9=-0.0007, k10=0.9881),
    ("HCB", 14.3): dict(k1=0.008693, k2=0.999, k3=-0.02, k4=0, k5=-5.043e-11, k6=2.233e-08, k7=-3.046e-06, k8=0.000116, k9=-0.001145, k10=0.9839),
    ("VOA", 0.6): dict(k1=0.043785, k2=1.04, k3=-0.18, k4=0, k5=0, k6=-4.783e-09, k7=1.962e-06, k8=-0.000229, k9=0.003141, k10=1.092),
    ("VOA", 2.7): dict(k1=-0.02395, k2=1.006, k3=-0.0188, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729),
    ("VOA", 14.3): dict(k1=0.005371, k2=1.0102, k3=-0.029, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729),
    ("HOA", 0.6): dict(k1=0.111147, k2=1.008, k3=-0.24, k4=0, k5=0, k6=-3.895e-09, k7=1.641e-06, k8=-0.000197, k9=0.002615, k10=1.1),
    ("HOA", 2.7): dict(k1=0.000435, k2=1.006, k3=-0.038, k4=0, k5=0, k6=7.859e-10, k7=-1.914e-07, k8=-9.128e-06, k9=-0.0007, k10=0.9981),
    ("HOA", 14.3): dict(k1=0.000904, k2=0.999, k3=-0.02, k4=0, k5=0, k6=7.859e-10, k7=-1.914e-07, k8=-9.128e-06, k9=-0.0007, k10=0.9981),
}

# Table 2 — arcing-current variation correction factor VarCf, keyed by config.
TABLE_2: dict[str, dict[str, float]] = {
    "VCB": dict(k1=0, k2=-0.0000014269, k3=0.000083137, k4=-0.0019382, k5=0.022366, k6=-0.12645, k7=0.30226),
    "VCBB": dict(k1=1.138e-06, k2=-6.0287e-05, k3=0.0012758, k4=-0.013778, k5=0.080217, k6=-0.24066, k7=0.33524),
    "HCB": dict(k1=0, k2=-3.097e-06, k3=0.00016405, k4=-0.0033609, k5=0.033308, k6=-0.16182, k7=0.34627),
    "VOA": dict(k1=9.5606e-07, k2=-5.1543e-05, k3=0.0011161, k4=-0.01242, k5=0.075125, k6=-0.23584, k7=0.33696),
    "HOA": dict(k1=0, k2=-3.1555e-06, k3=0.0001682, k4=-0.0034607, k5=0.034124, k6=-0.1599, k7=0.34629),
}

# Tables 3 / 4 / 5 — incident energy coefficients at 600 / 2700 / 14300 V.
TABLE_3: dict[str, dict[str, float]] = {  # 600 V
    "VCB": dict(k1=0.753364, k2=0.566, k3=1.752636, k4=0, k5=0, k6=-4.783e-09, k7=0.000001962, k8=-0.000229, k9=0.003141, k10=1.092, k11=0, k12=-1.598, k13=0.957),
    "VCBB": dict(k1=3.068459, k2=0.26, k3=-0.098107, k4=0, k5=0, k6=-5.767e-09, k7=0.000002524, k8=-0.00034, k9=0.01187, k10=1.013, k11=-0.06, k12=-1.809, k13=1.19),
    "HCB": dict(k1=4.073745, k2=0.344, k3=-0.370259, k4=0, k5=0, k6=-5.382e-09, k7=0.000002316, k8=-0.000302, k9=0.0091, k10=0.9725, k11=0, k12=-2.03, k13=1.036),
    "VOA": dict(k1=0.679294, k2=0.746, k3=1.222636, k4=0, k5=0, k6=-4.783e-09, k7=0.000001962, k8=-0.000229, k9=0.003141, k10=1.092, k11=0, k12=-1.598, k13=0.997),
    "HOA": dict(k1=3.470417, k2=0.465, k3=-0.261863, k4=0, k5=0, k6=-3.895e-09, k7=0.000001641, k8=-0.000197, k9=0.002615, k10=1.1, k11=0, k12=-1.99, k13=1.04),
}
TABLE_4: dict[str, dict[str, float]] = {  # 2700 V
    "VCB": dict(k1=2.40021, k2=0.165, k3=0.354202, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729, k11=0, k12=-1.569, k13=0.9778),
    "VCBB": dict(k1=3.870592, k2=0.185, k3=-0.736618, k4=0, k5=-9.204e-11, k6=2.901e-08, k7=-3.262e-06, k8=0.0001569, k9=-0.004003, k10=0.9825, k11=0, k12=-1.742, k13=1.09),
    "HCB": dict(k1=3.486391, k2=0.177, k3=-0.193101, k4=0, k5=0, k6=4.859e-10, k7=-1.814e-07, k8=-9.128e-06, k9=-0.0007, k10=0.9881, k11=0.027, k12=-1.723, k13=1.055),
    "VOA": dict(k1=3.880724, k2=0.105, k3=-1.906033, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729, k11=0, k12=-1.515, k13=1.115),
    "HOA": dict(k1=3.616266, k2=0.149, k3=-0.761561, k4=0, k5=0, k6=7.859e-10, k7=-1.914e-07, k8=-9.128e-06, k9=-0.0007, k10=0.9981, k11=0, k12=-1.639, k13=1.078),
}
TABLE_5: dict[str, dict[str, float]] = {  # 14300 V
    "VCB": dict(k1=3.825917, k2=0.11, k3=-0.999749, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729, k11=0, k12=-1.568, k13=0.99),
    "VCBB": dict(k1=3.644309, k2=0.215, k3=-0.585522, k4=0, k5=-9.204e-11, k6=2.901e-08, k7=-3.262e-06, k8=0.0001569, k9=-0.004003, k10=0.9825, k11=0, k12=-1.677, k13=1.06),
    "HCB": dict(k1=3.044516, k2=0.125, k3=0.245106, k4=0, k5=-5.043e-11, k6=2.233e-08, k7=-3.046e-06, k8=0.000116, k9=-0.001145, k10=0.9839, k11=0, k12=-1.655, k13=1.084),
    "VOA": dict(k1=3.405454, k2=0.12, k3=-0.93245, k4=-1.557e-12, k5=4.556e-10, k6=-4.186e-08, k7=8.346e-07, k8=5.482e-05, k9=-0.003191, k10=0.9729, k11=0, k12=-1.534, k13=0.979),
    "HOA": dict(k1=2.04049, k2=0.177, k3=1.005092, k4=0, k5=0, k6=7.859e-10, k7=-1.914e-07, k8=-9.128e-06, k9=-0.0007, k10=0.9981, k11=-0.05, k12=-1.633, k13=1.151),
}

# Table 7 — enclosure size correction factor coefficients b1..b3, keyed by
# (box_type, config). box_type in {Typical, Shallow}.
TABLE_7: dict[tuple[str, str], dict[str, float]] = {
    ("Typical", "VCB"): dict(b1=-0.000302, b2=0.03441, b3=0.4325),
    ("Typical", "VCBB"): dict(b1=-0.0002976, b2=0.032, b3=0.479),
    ("Typical", "HCB"): dict(b1=-0.0001923, b2=0.01935, b3=0.6899),
    ("Shallow", "VCB"): dict(b1=0.002222, b2=-0.02556, b3=0.6222),
    ("Shallow", "VCBB"): dict(b1=-0.002778, b2=0.1194, b3=-0.2778),
    ("Shallow", "HCB"): dict(b1=-0.0005556, b2=0.03722, b3=0.4778),
}

# Equation 11/12 constants A,B per config.
EQ11_AB: dict[str, tuple[float, float]] = {"VCB": (4, 20), "VCBB": (10, 24), "HCB": (10, 22)}

# IEEE 1584-2018 prints this conversion factor; we must use it to reproduce
# the standard's worked examples exactly.
MM_TO_IN = 0.03937

CAL_PER_J = 1.0 / 4.184  # 1 J/cm2 = 0.239 cal/cm2


# ──────────────────────────────────────────────────────────────────────────
# Core equations
# ──────────────────────────────────────────────────────────────────────────

def _i_arc_intermediate(config: str, voc_kv: float, ibf_ka: float, gap_mm: float) -> float:
    """Equation 1 — intermediate arcing current (kA) at a reference voltage."""
    k = TABLE_1[(config, voc_kv)]
    x1 = k["k1"] + k["k2"] * math.log10(ibf_ka) + k["k3"] * math.log10(gap_mm)
    x2 = (k["k4"] * ibf_ka ** 6 + k["k5"] * ibf_ka ** 5 + k["k6"] * ibf_ka ** 4
          + k["k7"] * ibf_ka ** 3 + k["k8"] * ibf_ka ** 2 + k["k9"] * ibf_ka + k["k10"])
    return (10 ** x1) * x2


def _var_cf(config: str, voc_kv: float) -> float:
    """Arcing-current variation correction factor (equation under Eq 2)."""
    k = TABLE_2[config]
    return (k["k1"] * voc_kv ** 6 + k["k2"] * voc_kv ** 5 + k["k3"] * voc_kv ** 4
            + k["k4"] * voc_kv ** 3 + k["k5"] * voc_kv ** 2 + k["k6"] * voc_kv + k["k7"])


def _enclosure_cf(config: str, voc_kv: float, h_mm: float, w_mm: float, d_mm: float) -> float:
    """Enclosure size correction factor CF (Eq 11-15, Table 6/7).

    Open-air configs (VOA/HOA) return 1.0. Otherwise computes the equivalent
    enclosure size (EES) and applies the box-type polynomial.
    """
    if config in ("VOA", "HOA"):
        return 1.0

    if voc_kv < 0.6 and h_mm < 508 and w_mm < 508 and d_mm <= 203.2:
        box_type = "Shallow"
    else:
        box_type = "Typical"

    A, B = EQ11_AB[config]

    def eq_11_12(dim_mm: float) -> float:
        # returns dimension_1 in inches
        y1 = dim_mm - 660.4
        y2 = (voc_kv + A) / B
        return (660.4 + (y1 * y2)) / 25.4

    # width_1 (inches) — Table 6 logic
    if w_mm < 508:
        width_1 = 20.0 if box_type == "Typical" else MM_TO_IN * w_mm
    elif w_mm <= 660.4:
        width_1 = MM_TO_IN * w_mm
    elif w_mm <= 1244.6:
        width_1 = eq_11_12(w_mm)
    else:
        width_1 = eq_11_12(1244.6)

    # height_1 (inches) — Table 6 logic (VCB differs from VCBB/HCB above 660.4)
    if h_mm < 508:
        height_1 = 20.0 if box_type == "Typical" else MM_TO_IN * h_mm
    elif h_mm <= 660.4:
        height_1 = MM_TO_IN * h_mm
    elif h_mm <= 1244.6:
        height_1 = MM_TO_IN * h_mm if config == "VCB" else eq_11_12(h_mm)
    else:
        height_1 = 49.0 if config == "VCB" else eq_11_12(1244.6)

    ees = (height_1 + width_1) / 2.0  # Equation 13 (inches)

    b = TABLE_7[(box_type, config)]
    x1 = b["b1"] * ees ** 2 + b["b2"] * ees + b["b3"]
    return x1 if box_type == "Typical" else 1.0 / x1


def _intermediate_e(config: str, voc_kv: float, i_arc_ka: float, ibf_ka: float,
                    t_ms: float, gap_mm: float, cf: float, d_mm: float,
                    i_arc_600_ka: float | None = None) -> float:
    """Equations 3/4/5/6 — intermediate incident energy (J/cm2)."""
    if voc_kv <= 0.6:
        k = TABLE_3[config]
    elif voc_kv == 2.7:
        k = TABLE_4[config]
    else:
        k = TABLE_5[config]

    x1 = 12.552 / 50.0 * t_ms
    x2 = k["k1"] + k["k2"] * math.log10(gap_mm)
    x3_num = k["k3"] * (i_arc_600_ka if i_arc_600_ka is not None else i_arc_ka)
    x3_den = (k["k4"] * ibf_ka ** 7 + k["k5"] * ibf_ka ** 6 + k["k6"] * ibf_ka ** 5
              + k["k7"] * ibf_ka ** 4 + k["k8"] * ibf_ka ** 3 + k["k9"] * ibf_ka ** 2
              + k["k10"] * ibf_ka)
    x3 = x3_num / x3_den
    x4 = k["k11"] * math.log10(ibf_ka) + k["k13"] * math.log10(i_arc_ka) + math.log10(1.0 / cf)
    x5 = k["k12"] * math.log10(d_mm)
    return x1 * 10 ** (x2 + x3 + x4 + x5)


def _intermediate_afb(config: str, voc_kv: float, e_j_cm2: float, d_mm: float) -> float:
    """Equations 7-10 (simplified form) — intermediate arc-flash boundary (mm).

    AFB is the distance where E = 1.2 cal/cm2 = 5.0208 J/cm2. Since E falls off
    as D^k12, F = E / D^k12 is distance-independent and AFB = (5.0208/F)^(1/k12).
    """
    if voc_kv <= 0.6:
        k = TABLE_3[config]
    elif voc_kv == 2.7:
        k = TABLE_4[config]
    else:
        k = TABLE_5[config]
    f = e_j_cm2 / (d_mm ** k["k12"])
    return (5.0208 / f) ** (1.0 / k["k12"])


def _interpolate(voc_kv: float, x600: float, x2700: float, x14300: float) -> float:
    """Equations 16-24 — interpolate a quantity to the actual system voltage."""
    x1 = (((x2700 - x600) / 2.1) * (voc_kv - 2.7)) + x2700
    x2 = (((x14300 - x2700) / 11.6) * (voc_kv - 14.3)) + x14300
    x3 = ((x1 * (2.7 - voc_kv)) / 2.1) + ((x2 * (voc_kv - 0.6)) / 2.1)
    if 0.6 < voc_kv <= 2.7:
        return x3
    return x2  # voc_kv > 2.7


def _i_arc_final_lv(voc_kv: float, i_arc_600_ka: float, ibf_ka: float) -> float:
    """Equation 25 — final LV arcing current from the 600 V intermediate value."""
    x1 = (0.6 / voc_kv) ** 2
    x2 = 1.0 / (i_arc_600_ka ** 2)
    x3 = (0.6 ** 2 - voc_kv ** 2) / (0.6 ** 2 * ibf_ka ** 2)
    return 1.0 / math.sqrt(x1 * (x2 - x3))


def _ppe_category(e_cal: float) -> tuple[int, str]:
    """NFPA 70E PPE category from incident energy (cal/cm2)."""
    if e_cal < 1.2:
        return 0, "PPE Cat 0 - non-melting / untreated natural-fibre"
    if e_cal < 4.0:
        return 1, "PPE Cat 1 - 4 cal/cm2 arc-rated"
    if e_cal < 8.0:
        return 2, "PPE Cat 2 - 8 cal/cm2 arc-rated + hood"
    if e_cal < 25.0:
        return 3, "PPE Cat 3 - 25 cal/cm2 flash suit"
    if e_cal < 40.0:
        return 4, "PPE Cat 4 - 40 cal/cm2 encapsulated suit"
    return -1, "DANGER >40 cal/cm2 - no PPE rated; design out / remote operation"


# ──────────────────────────────────────────────────────────────────────────
# Full analysis
# ──────────────────────────────────────────────────────────────────────────

def analyse(voltage_v: float, ibf_ka: float, config: str, gap_mm: float,
            working_distance_mm: float, clearing_time_ms: float,
            enclosure_h_mm: float, enclosure_w_mm: float, enclosure_d_mm: float,
            full_or_reduced: str) -> dict:
    """Run one IEEE 1584-2018 calculation (full OR reduced arcing current)."""
    voc_kv = voltage_v / 1000.0
    cf = _enclosure_cf(config, voc_kv, enclosure_h_mm, enclosure_w_mm, enclosure_d_mm)
    var_cf = _var_cf(config, voc_kv)
    reduce_factor = (1 - 0.5 * var_cf) if full_or_reduced == "reduced" else 1.0

    if voc_kv > 0.6:  # HV path: compute at 3 voltages then interpolate
        ia600 = _i_arc_intermediate(config, 0.6, ibf_ka, gap_mm) * reduce_factor
        ia2700 = _i_arc_intermediate(config, 2.7, ibf_ka, gap_mm) * reduce_factor
        ia14300 = _i_arc_intermediate(config, 14.3, ibf_ka, gap_mm) * reduce_factor
        i_arc = _interpolate(voc_kv, ia600, ia2700, ia14300)

        e600 = _intermediate_e(config, 0.6, ia600, ibf_ka, clearing_time_ms, gap_mm, cf, working_distance_mm)
        e2700 = _intermediate_e(config, 2.7, ia2700, ibf_ka, clearing_time_ms, gap_mm, cf, working_distance_mm)
        e14300 = _intermediate_e(config, 14.3, ia14300, ibf_ka, clearing_time_ms, gap_mm, cf, working_distance_mm)
        e_j = _interpolate(voc_kv, e600, e2700, e14300)

        afb600 = _intermediate_afb(config, 0.6, e600, working_distance_mm)
        afb2700 = _intermediate_afb(config, 2.7, e2700, working_distance_mm)
        afb14300 = _intermediate_afb(config, 14.3, e14300, working_distance_mm)
        afb_mm = _interpolate(voc_kv, afb600, afb2700, afb14300)
    else:  # LV path
        ia600_full = _i_arc_intermediate(config, 0.6, ibf_ka, gap_mm)
        i_arc_full = _i_arc_final_lv(voc_kv, ia600_full, ibf_ka)
        i_arc = i_arc_full * reduce_factor
        # NB: incident energy uses the 600 V intermediate value (full, not reduced)
        # per IEEE 1584-2018 Eq 6 / Annex D.2.
        e_j = _intermediate_e(config, voc_kv, i_arc, ibf_ka, clearing_time_ms,
                              gap_mm, cf, working_distance_mm, i_arc_600_ka=ia600_full)
        afb_mm = _intermediate_afb(config, voc_kv, e_j, working_distance_mm)

    return {
        "arcing_current_ka": i_arc,
        "incident_energy_j_cm2": e_j,
        "incident_energy_cal_cm2": e_j * CAL_PER_J,
        "arc_flash_boundary_mm": afb_mm,
        "enclosure_cf": cf,
        "var_cf": var_cf,
    }


def compute(payload: dict) -> dict:
    voltage_v = float(payload.get("voltage_v", 480))
    ibf_ka = float(payload.get("prospective_fault_current_ka", 25))
    config = str(payload.get("electrode_config", "VCB")).upper()
    gap_mm = float(payload.get("gap_mm", 32))
    working_distance_mm = float(payload.get("working_distance_mm", 609.6))
    clearing_time_ms = float(payload.get("clearing_time_ms", 100))
    # Default enclosure: IEEE 1584-2018 typical LV switchgear box.
    h = float(payload.get("enclosure_height_mm", 610))
    w = float(payload.get("enclosure_width_mm", 610))
    d = float(payload.get("enclosure_depth_mm", 254))

    if config not in TABLE_1 and (config, 0.6) not in TABLE_1:
        config = "VCB"

    # IEEE 1584-2018 requires BOTH the full and reduced arcing-current cases be
    # evaluated; the WORSE (higher incident energy) governs. A lower arc current
    # can take longer to clear -> higher energy.
    res_full = analyse(voltage_v, ibf_ka, config, gap_mm, working_distance_mm,
                       clearing_time_ms, h, w, d, "full")
    res_reduced = analyse(voltage_v, ibf_ka, config, gap_mm, working_distance_mm,
                          clearing_time_ms, h, w, d, "reduced")

    governing = res_full if res_full["incident_energy_j_cm2"] >= res_reduced["incident_energy_j_cm2"] else res_reduced
    governing_case = "full" if governing is res_full else "reduced"

    e_cal = governing["incident_energy_cal_cm2"]
    ppe, ppe_desc = _ppe_category(e_cal)

    return {
        "incident_energy_cal_cm2": round(e_cal, 3),
        "incident_energy_j_cm2": round(governing["incident_energy_j_cm2"], 3),
        "arc_flash_boundary_mm": round(governing["arc_flash_boundary_mm"], 0),
        "ppe_category": ppe,
        "ppe_description": ppe_desc,
        "working_distance_mm": working_distance_mm,
        "arcing_current_ka": round(governing["arcing_current_ka"], 3),
        "clearing_time_ms": clearing_time_ms,
        "voltage_v": voltage_v,
        "electrode_config": config,
        "gap_mm": gap_mm,
        "enclosure_cf": round(governing["enclosure_cf"], 4),
        "var_cf": round(governing["var_cf"], 4),
        "governing_case": governing_case,
        "full_case_cal_cm2": round(res_full["incident_energy_cal_cm2"], 3),
        "reduced_case_cal_cm2": round(res_reduced["incident_energy_cal_cm2"], 3),
        "model": "IEEE 1584-2018",
        "notes": (
            "Incident energy at the stated working distance and arc duration. "
            "Arc duration = upstream protective-device clearing time (feed from "
            "the protection-coordination tool). BOTH full and reduced arcing-"
            "current cases evaluated; the higher-energy case governs per "
            "IEEE 1584-2018 s4.10. PPE category per NFPA 70E."
        ),
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
