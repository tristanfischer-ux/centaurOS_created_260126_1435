#!/usr/bin/env python3
"""
field_weakening_mtpa.py — analytical IPMSM current setpoints under V/I limits.

STAGED → inverter:field-weakening-mtpa

Uses steady-state d-q voltage equations (neglecting R optionally) to find
(i_d, i_q) on the MTPA ray below base speed and on the voltage ellipse above.
"""
from __future__ import annotations

import json
import math
import sys

HARD = ["omega_elec_rad_s", "lambda_pm_wb", "ld_h", "lq_h", "i_max_a", "v_max_v"]


def solve(inp: dict) -> dict:
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")

    w = float(inp["omega_elec_rad_s"])
    lam = float(inp["lambda_pm_wb"])
    ld = float(inp["ld_h"])
    lq = float(inp["lq_h"])
    i_max = float(inp["i_max_a"])
    v_max = float(inp["v_max_v"])
    rs = float(inp.get("rs_ohm", 0.0))
    if min(w, lam, ld, lq, i_max, v_max) <= 0:
        raise ValueError("HARD inputs must be > 0")

    # Base speed approx: back-EMF limited, i=0 → ω_base ≈ V_max / λ
    omega_base = v_max / lam

    # MTPA for salient machine (simple): for SPM (Ld≈Lq) → id=0, iq=I
    # For IPMSM with Lq>Ld use classic MTPA angle approx.
    saliency = (lq - ld) / max(ld, 1e-9)
    if abs(lq - ld) < 1e-9:
        id_mtpa = 0.0
        iq_mtpa = i_max
    else:
        # β* from standard MTPA: id = (λ - sqrt(λ² + 8(Lq-Ld)² I²))/(4(Lq-Ld)) style
        # Use compact form for |I|=Imax
        denom = 4.0 * (lq - ld)
        disc = lam ** 2 + 8.0 * (lq - ld) ** 2 * i_max ** 2
        id_mtpa = (lam - math.sqrt(max(disc, 0.0))) / denom
        # clamp magnitude
        id_mtpa = max(-i_max, min(0.0, id_mtpa))
        iq_mtpa = math.sqrt(max(i_max ** 2 - id_mtpa ** 2, 0.0))

    def voltages(id_, iq_):
        vd = rs * id_ - w * lq * iq_
        vq = rs * iq_ + w * (ld * id_ + lam)
        return vd, vq, math.hypot(vd, vq)

    # Below base: try MTPA; if voltage exceeded, enter FW
    id_c, iq_c = id_mtpa, iq_mtpa
    mode = "mtpa"
    vd, vq, vmag = voltages(id_c, iq_c)

    if w > omega_base or vmag > v_max:
        mode = "field_weakening"
        # Solve for id on current circle maximizing iq under |v|<=Vmax (1-D scan)
        best = None
        for k in range(0, 181):
            ang = math.pi * k / 180.0  # 0..π → id negative hemisphere
            id_ = -i_max * math.sin(ang)
            iq_ = i_max * math.cos(ang)
            if iq_ < 0:
                continue
            _, _, vm = voltages(id_, iq_)
            if vm <= v_max * 1.001:
                t_proxy = lam * iq_ + (ld - lq) * id_ * iq_  # torque ∝
                if best is None or t_proxy > best[0]:
                    best = (t_proxy, id_, iq_, vm)
        if best is None:
            # deepest FW: id=-Imax, iq=0
            id_c, iq_c = -i_max, 0.0
            vd, vq, vmag = voltages(id_c, iq_c)
            warnings = ["no feasible (id,iq) on current circle inside voltage limit"]
        else:
            _, id_c, iq_c, vmag = best
            vd, vq, _ = voltages(id_c, iq_c)
            warnings = []
    else:
        warnings = []

    torque = 1.5 * (lam * iq_c + (ld - lq) * id_c * iq_c)  # Nm for 1 pole-pair; scale poles outside
    n_pp = int(inp.get("pole_pairs", 1))
    torque *= n_pp

    return {
        "omega_base_elec_rad_s": round(omega_base, 3),
        "operating_mode": mode,
        "i_d_a": round(id_c, 4),
        "i_q_a": round(iq_c, 4),
        "v_d_v": round(vd, 3),
        "v_q_v": round(vq, 3),
        "v_mag_v": round(vmag, 3),
        "torque_nm": round(torque, 4),
        "saliency_ratio_lq_over_ld": round(lq / ld, 4),
        "warnings": warnings,
    }


def _selftest() -> None:
    # Below base — MTPA / SPM-like
    lo = solve({
        "omega_elec_rad_s": 500.0,
        "lambda_pm_wb": 0.05,
        "ld_h": 50e-6,
        "lq_h": 50e-6,
        "i_max_a": 400.0,
        "v_max_v": 400.0,
        "pole_pairs": 4,
    })
    assert lo["operating_mode"] == "mtpa"
    assert abs(lo["i_d_a"]) < 1e-6
    # High speed — must field-weaken
    hi = solve({
        "omega_elec_rad_s": 20000.0,
        "lambda_pm_wb": 0.05,
        "ld_h": 50e-6,
        "lq_h": 80e-6,
        "i_max_a": 400.0,
        "v_max_v": 400.0,
        "pole_pairs": 4,
    })
    assert hi["operating_mode"] == "field_weakening"
    assert hi["i_d_a"] < 0
    print("field_weakening_mtpa selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    try:
        print(json.dumps(solve(json.load(sys.stdin))))
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"JSON parse: {exc}"})); sys.exit(2)
    except Exception as exc:
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}"})); sys.exit(3)
