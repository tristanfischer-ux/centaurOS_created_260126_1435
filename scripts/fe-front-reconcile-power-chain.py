#!/usr/bin/env python3
"""Reconcile front FPK DC→shaft→wheel + thermal ΔT on an existing twin.

INTENT (2026-07-29 red-team): tool η updates left mgu_shaft_power_kw stale.
Mirrors scripts/lib/orchestrator/class-plans/formula-e-front-mgu.ts
reconcileFrontFpkPowerChain so Excel rebuild sees a closed power plane.

Usage: python3 scripts/fe-front-reconcile-power-chain.py <outDir>
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from fpk_excel_live_plan import (  # noqa: E402
    stamp_fpk_formula_provenance,
    sync_front_fpk_power_reconcile_tools_page,
)


def qv(q: dict, key: str, default: float) -> float:
    raw = q.get(key)
    if isinstance(raw, dict):
        try:
            v = float(raw.get("value"))
            return v if math.isfinite(v) and v != 0 else default
        except (TypeError, ValueError):
            return default
    try:
        v = float(raw)
        return v if math.isfinite(v) and v != 0 else default
    except (TypeError, ValueError):
        return default


def qnum(q: dict, key: str) -> float | None:
    raw = q.get(key)
    if isinstance(raw, dict):
        try:
            v = float(raw.get("value"))
            return v if math.isfinite(v) else None
        except (TypeError, ValueError):
            return None
    try:
        v = float(raw)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def setq(q: dict, key: str, value: float, unit: str, basis: str, condition: str) -> None:
    prev = q.get(key) if isinstance(q.get(key), dict) else {}
    q[key] = {
        **prev,
        "value": value,
        "unit": unit,
        "family": prev.get("family") or "power",
        "basis": basis,
        "scope": prev.get("scope") or "system",
        "condition": condition,
        "source": "calculator",
        "source_detail": condition,
        "provenance": {
            "source": "calculator",
            "tool_id": "front_fpk_power_reconcile",
            "invocation_output_field": key,
        },
    }


def reconcile(st: dict) -> dict:
    oc = st.setdefault("orchestratorContract", {})
    q = oc.setdefault("quantities", {})
    p_dc = qv(q, "continuous_power_kw", qv(q, "front_regen_electrical_cap_kw", 250))
    eta_inv = qv(q, "inverter_efficiency", 0.985)
    eta_mgu = qv(q, "mgu_efficiency", 0.97)
    eta_gear = qv(q, "gear_efficiency", 0.97)
    rpm = qv(q, "mgu_base_speed_rpm", 19500)
    omega = rpm * 2 * math.pi / 60
    flow = qv(q, "coolant_flow_l_min", 12)
    inlet = qv(q, "coolant_inlet_c", 60)
    rho, cp = 1030.0, 3500.0

    # Stash IPMSM capability before overwrite
    prior_shaft = qnum(q, "mgu_shaft_power_kw")
    if prior_shaft is not None and "ipmsm_capability_shaft_power_kw" not in q:
        setq(q, "ipmsm_capability_shaft_power_kw", prior_shaft, "kW", "rated",
             "IPMSM D²L analytical capability (EM check; not power-flow shaft)")

    p_ac = p_dc * eta_inv
    p_shaft = p_ac * eta_mgu
    p_wheel = p_shaft * eta_gear
    t_shaft = (p_shaft * 1000) / max(omega, 1e-9)
    inv_loss = qnum(q, "inverter_dissipated_kw")
    cu = qnum(q, "mgu_copper_loss_w")
    fe = qnum(q, "mgu_iron_loss_w") or 0.0
    mag = qnum(q, "mgu_magnet_loss_w") or 0.0
    if inv_loss is not None and cu is not None:
        loss = inv_loss + (cu + fe + mag) / 1000.0
    else:
        loss = max(0.0, p_dc - p_shaft)
    mdot = (flow / 60.0) * (rho / 1000.0)
    dt = (loss * 1000.0) / (mdot * cp) if mdot > 0 else 0.0
    hw = qv(q, "front_hardware_power_class_kw", 350)
    vdc = qv(q, "assumed_vdc_min_v", qv(q, "v_dc_min_v", 600))
    i_ph = math.ceil((hw * 1000) / (math.sqrt(3) * (vdc / math.sqrt(2))))
    i_des = math.ceil(i_ph * 1.12)

    # Mass seeds (not 0.9×cap)
    m_motor, m_inv, m_gear, m_hous = 11.5, 8.2, 6.4, 2.7
    setq(q, "mass_motor_kg", m_motor, "kg", "rated", "concept IPMSM share")
    setq(q, "mass_inverter_kg", m_inv, "kg", "rated", "concept SiC MCU share")
    setq(q, "mass_gear_diff_kg", m_gear, "kg", "rated", "concept gear+diff share")
    setq(q, "mass_housing_misc_kg", m_hous, "kg", "rated", "concept cassette share")
    setq(q, "unit_mass_kg", round((m_motor + m_inv + m_gear + m_hous) * 10) / 10, "kg", "rated",
         "Σ concept mass seeds (CAD/BoM weigh replaces) — NOT 0.9×cap")

    setq(q, "dc_input_electrical_kw_continuous", p_dc, "kW", "continuous",
         "Power ENTERS: HV DC from RESS → inverter")
    setq(q, "mgu_ac_electrical_input_kw", round(p_ac, 3), "kW", "continuous",
         f"P_dc × η_inv ({eta_inv})")
    setq(q, "mgu_shaft_power_kw", round(p_shaft, 3), "kW", "continuous",
         f"P_dc × η_inv × η_mgu ({eta_inv}×{eta_mgu}) — MECHANICAL shaft")
    setq(q, "gear_output_power_kw", round(p_wheel, 3), "kW", "continuous",
         f"P_shaft × η_gear ({eta_gear}) — exits to halfshafts")
    setq(q, "mgu_shaft_torque_nm", round(t_shaft, 1), "Nm", "continuous",
         f"T=P_shaft/ω at {rpm} rpm (mechanical shaft)")
    setq(q, "total_dissipated_kw_continuous", round(loss, 3), "kW", "continuous",
         "Heat to coolant at continuous duty")
    setq(q, "coolant_delta_t_k", round(dt, 3), "K", "continuous",
         f"ΔT=Q/(ṁ·cp) at {flow} L/min EGW")
    setq(q, "coolant_outlet_c", round(inlet + dt, 1), "°C", "continuous",
         "inlet + ΔT (lump)")
    setq(q, "phase_current_max_a", float(i_ph), "A", "peak",
         f"Ideal SVPWM at Vdc,min={vdc} for P_hw={hw}")
    setq(q, "phase_current_design_a", float(i_des), "A", "peak",
         "I_ph_max × 1.12 design margin")

    # Also patch peak_mechanical alias if present
    if "peak_mechanical_power_kw" in q:
        setq(q, "peak_mechanical_power_kw", round(p_shaft, 3), "kW", "continuous",
             "alias of reconciled mgu_shaft_power_kw")

    return {
        "p_dc": p_dc,
        "eta_inv": eta_inv,
        "eta_mgu": eta_mgu,
        "p_shaft": round(p_shaft, 3),
        "t_shaft": round(t_shaft, 1),
        "loss_kw": round(loss, 3),
        "dT_k": round(dt, 3),
        "i_ph": i_ph,
        "i_design": i_des,
        "unit_mass": round(m_motor + m_inv + m_gear + m_hous, 1),
        "check_250_chain": round(250 * eta_inv * eta_mgu, 3),
    }


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else
               "out/formula-e-front-mgu-20260729-1432")
    st_path = out / "state.json"
    st = json.loads(st_path.read_text())
    summary = reconcile(st)
    stamp_fpk_formula_provenance(st)
    side_path = out / "4-orchestrator-tools-used.json"
    if side_path.is_file():
        side = json.loads(side_path.read_text())
        if sync_front_fpk_power_reconcile_tools_page(side, st):
            side_path.write_text(json.dumps(side, indent=2) + "\n")
    page = st.get("toolsUsedPage")
    if isinstance(page, dict):
        sync_front_fpk_power_reconcile_tools_page(page, st)
    st["ship_ok"] = False
    st_path.write_text(json.dumps(st, indent=2))
    (out / "power-chain-reconcile.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    # Verify chain closes
    expect = summary["p_dc"] * summary["eta_inv"] * summary["eta_mgu"]
    assert abs(summary["p_shaft"] - expect) < 0.05, (summary["p_shaft"], expect)
    print("[ok] power chain closed within 0.05 kW")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
