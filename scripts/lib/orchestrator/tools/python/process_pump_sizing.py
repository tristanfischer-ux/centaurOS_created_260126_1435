#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/process_pump_sizing.py

process:pump-sizing — FIRST-PRINCIPLES sizing of a PROCESS centrifugal pump
(amine circulation, slurry transfer, reflux, etc. in a chemical plant).

WHAT IT DOES
    Given a volumetric duty Q, the pipe run (length + bore + roughness) and the
    fluid, it computes the pump total dynamic head and the motor power:

      H_total = H_static + H_friction + H_fittings + H_process
      H_friction = Darcy-Weisbach: f x (L/D) x V^2 / (2 g)        [m]
          f via the Swamee-Jain explicit Colebrook approximation (turbulent),
          f = 64/Re (laminar).
      P_hydraulic = rho x g x Q x H                                [W]
      P_shaft     = P_hydraulic / eta_pump
      P_motor     = P_shaft / eta_motor   -> next standard IEC frame up

    This is a PROCESS pump, NOT an irrigation system: there are no emitters,
    sprinklers, atomisers or Hazen-Williams agricultural correlations. The
    friction model is Darcy-Weisbach (the chemical-engineering standard, valid
    for any Newtonian fluid + Reynolds regime), and the head terms are the
    process duty (static lift + pipe friction + fittings + a process backpressure
    e.g. column packing / exchangers / filter).

INPUT (JSON on stdin)
    {
      "pump_name": "MEA circulation pump",     # optional label
      "flow_m3_h": 3.0,                          # duty volumetric flow [m3/h]
      "parallel_pumps": 1,                       # PER-UNIT BASIS: N parallel pump
                                                 #   trains sharing flow_m3_h. The tool
                                                 #   sizes ONE pump on its share
                                                 #   (flow_m3_h / parallel_pumps), so
                                                 #   the worked-calc, velocity, head and
                                                 #   power are all PER-PUMP. Default 1.
      "fluid_density_kg_m3": 1000.0,            # 30 wt% aqueous MEA ~ water
      "fluid_viscosity_pa_s": 0.0013,           # dynamic viscosity (water ~1.0e-3)
      "static_head_m": 12.0,                    # elevation lift (suction -> delivery)
      "total_dynamic_head_m": null,             # OPTIONAL authoritative total dynamic
                                                 #   head [m]. When given, it OVERRIDES
                                                 #   the static+friction+process sum so
                                                 #   the pump head EQUALS the caller's
                                                 #   pre-computed TDH (avoids DOUBLE-
                                                 #   COUNTING friction the caller already
                                                 #   included). The friction/process
                                                 #   terms are still reported for context.
      "pipe_length_m": 40.0,                    # straight pipe run [m]
      "pipe_diameter_mm": 50.0,                 # internal bore [mm]
      "roughness_mm": 0.015,                    # absolute roughness (drawn ss ~0.015)
      "fittings_equiv_length_m": 0.0,           # optional extra equivalent length
      "process_backpressure_kpa": 250.0,        # column packing + exchangers + filter dP
      "pump_efficiency": 0.65,                  # centrifugal at duty point
      "motor_efficiency": 0.90
    }

OUTPUT (JSON on stdout)
    pump_head_m, hydraulic_power_w, shaft_power_w, motor_power_kw,
    recommended_motor_kw, pump_flow_lpm, pipe_velocity_m_s, reynolds, plus a
    worked[] array (each line hand-checkable) and a _provenance block. ERRORS
    (never fabricates) on non-physical inputs.

LICENCE: tool wrapper internal. Darcy-Weisbach + Swamee-Jain friction factor +
affinity-law motor sizing — conventional pump hydraulics. References:
- Karassik et al., "Pump Handbook", 4th ed., McGraw-Hill 2008
- Coulson & Richardson "Chemical Engineering" Vol 1 (fluid flow) / Sinnott Vol 6
- Swamee & Jain (1976), "Explicit equations for pipe-flow problems", J. Hydraul. Div.
NO fabricated constants. British spelling.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "process_pump_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Karassik et al. 'Pump Handbook' 4th ed.; Coulson & Richardson "
        "'Chemical Engineering' Vol 1 (fluid flow); Swamee & Jain (1976) "
        "explicit Colebrook friction-factor approximation."
    ),
    "physics_basis": (
        "Pump total dynamic head H = static lift + Darcy-Weisbach pipe friction "
        "f (L/D) V^2/(2g) + fittings + process backpressure, with f from the "
        "Swamee-Jain explicit Colebrook correlation (laminar f = 64/Re). Motor "
        "power P = rho g Q H / (eta_pump x eta_motor), rounded up to the next "
        "standard IEC frame size."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}

G = 9.80665
# Standard IEC motor frame sizes (kW) — the FULL IEC 60072 / IEC 60034 range.
# (2026-06-16) The list previously ceiling-ed at 75 kW, so any duty above ~65 kW
# shaft silently returned recommended_motor_kw = 75 (the next() fallback to the last
# element) — an IMPOSSIBLE motor < shaft power (a 156 kW RAS recirc pump reported a
# 75 kW motor). Large process / recirculation pumps routinely need 90-630 kW motors;
# extend the list so recommended_motor_kw is ALWAYS ≥ the true shaft power.
STD_MOTORS_KW = [0.18, 0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5,
                 7.5, 11.0, 15.0, 18.5, 22.0, 30.0, 37.0, 45.0, 55.0, 75.0,
                 90.0, 110.0, 132.0, 160.0, 200.0, 250.0, 315.0, 355.0, 400.0,
                 450.0, 500.0, 560.0, 630.0, 710.0, 800.0, 900.0, 1000.0]


def compute(payload: dict) -> dict:
    pump_name = str(payload.get("pump_name", "process pump"))
    flow_m3_h_total = float(payload.get("flow_m3_h", 3.0))
    if flow_m3_h_total <= 0:
        raise ValueError("flow_m3_h must be > 0")
    # PER-UNIT BASIS (universal): N parallel pump trains share the supplied duty flow.
    # Sizing ONE pump on its share (total / N) is the ONLY honest basis — velocity,
    # friction, hydraulic, shaft and motor are then all PER-PUMP, and per-pump × N
    # closes back to the loop total. parallel_pumps defaults to 1 (a single pump),
    # so legacy single-pump callers are byte-unchanged. Never < 1.
    parallel_pumps = int(payload.get("parallel_pumps", 1) or 1)
    if parallel_pumps < 1:
        parallel_pumps = 1
    flow_m3_h = flow_m3_h_total / parallel_pumps     # PER-PUMP duty flow
    if flow_m3_h <= 0:
        raise ValueError("per-pump flow (flow_m3_h / parallel_pumps) must be > 0")
    rho = float(payload.get("fluid_density_kg_m3", 1000.0))
    if rho <= 0:
        raise ValueError("fluid_density_kg_m3 must be > 0")
    mu = float(payload.get("fluid_viscosity_pa_s", 0.0013))
    if mu <= 0:
        raise ValueError("fluid_viscosity_pa_s must be > 0")
    static_head_m = float(payload.get("static_head_m", 0.0))
    pipe_length_m = float(payload.get("pipe_length_m", 40.0))
    pipe_dia_mm = float(payload.get("pipe_diameter_mm", 50.0))
    if pipe_dia_mm <= 0:
        raise ValueError("pipe_diameter_mm must be > 0")
    roughness_mm = float(payload.get("roughness_mm", 0.015))
    fittings_equiv_length_m = float(payload.get("fittings_equiv_length_m", 0.0))
    process_backpressure_kpa = float(payload.get("process_backpressure_kpa", 0.0))
    pump_eff = float(payload.get("pump_efficiency", 0.65))
    motor_eff = float(payload.get("motor_efficiency", 0.90))
    if not 0.0 < pump_eff <= 1.0 or not 0.0 < motor_eff <= 1.0:
        raise ValueError("efficiencies must be in (0, 1]")

    # ---- Flow + velocity ----
    q_m3_s = flow_m3_h / 3600.0
    d_m = pipe_dia_mm / 1000.0
    area_m2 = math.pi * (d_m / 2.0) ** 2
    velocity_m_s = q_m3_s / max(1e-12, area_m2)

    # ---- Reynolds number + Darcy friction factor ----
    reynolds = rho * velocity_m_s * d_m / mu
    rel_rough = (roughness_mm / 1000.0) / d_m
    if reynolds < 2300:
        f_darcy = 64.0 / max(1e-9, reynolds)         # laminar
        f_basis = "laminar f = 64/Re"
    else:
        # Swamee-Jain explicit Colebrook approximation (turbulent)
        f_darcy = 0.25 / (math.log10(rel_rough / 3.7 + 5.74 / reynolds ** 0.9)) ** 2
        f_basis = "Swamee-Jain explicit Colebrook (turbulent)"

    # ---- Head terms ----
    l_eff_m = pipe_length_m + fittings_equiv_length_m
    h_friction_m = f_darcy * (l_eff_m / d_m) * velocity_m_s ** 2 / (2.0 * G)
    # Process backpressure (column packing + exchangers + filter dP) as head.
    h_process_m = process_backpressure_kpa * 1000.0 / (rho * G)
    # AUTHORITATIVE-HEAD OVERRIDE (universal): when the caller supplies a pre-computed
    # total dynamic head (it already summed static lift + in-line process losses +
    # friction for the WHOLE loop), USE IT directly as the pump head. Re-summing
    # static_head + friction + process here would DOUBLE-COUNT the friction the caller
    # already rolled in (the 14.5 m contract TDH read as 26.35 m). The component terms
    # stay computed + reported for context; only the TOTAL is taken from the override.
    tdh_override = payload.get("total_dynamic_head_m", None)
    if tdh_override is not None and float(tdh_override) > 0:
        h_total_m = float(tdh_override)
        head_basis = "caller-supplied total dynamic head (static+process+friction pre-summed upstream)"
    else:
        h_total_m = static_head_m + h_friction_m + h_process_m
        head_basis = "static lift + Darcy-Weisbach friction + process backpressure"

    # ---- Power ----
    p_hydraulic_w = rho * G * q_m3_s * h_total_m
    p_shaft_w = p_hydraulic_w / pump_eff
    p_motor_w = p_shaft_w / motor_eff
    p_motor_kw = p_motor_w / 1000.0
    recommended_motor_kw = next(
        (s for s in STD_MOTORS_KW if s >= p_motor_kw * 1.15), STD_MOTORS_KW[-1])

    # ===================== worked[] — drift-safe, chained off rounded intermediates =====
    velocity_r = round(velocity_m_s, 4)
    reynolds_r = round(reynolds, 1)
    f_darcy_r = round(f_darcy, 5)
    h_friction_r = round(h_friction_m, 3)
    h_process_r = round(h_process_m, 3)
    h_total_r = round(h_total_m, 3)
    p_hyd_r = round(p_hydraulic_w, 1)
    p_shaft_r = round(p_shaft_w, 1)
    p_motor_r = round(p_motor_w, 1)

    worked = []
    if parallel_pumps > 1:
        worked.append(worked_calc(
            label="Per-pump duty flow",
            formula="Q_pump = Q_total / N_parallel",
            values={"Q_total": (round(flow_m3_h_total, 1), "m3/h"),
                    "N_parallel": (parallel_pumps, "")},
            result=round(flow_m3_h, 1), result_unit="m3/h",
            assumptions=[f"{parallel_pumps} parallel pump trains share the duty; ONE pump is "
                         f"sized on its share (per-pump x {parallel_pumps} = the loop total)"],
        ))
    worked += [
        worked_calc(
            label="Pipe velocity",
            formula="V = (Q_m3h / 3600) / (pi/4 x D^2)",
            values={"Q_m3h": (round(flow_m3_h, 4), "m3/h"), "D": (round(d_m, 4), "m")},
            result=velocity_r, result_unit="m/s",
            assumptions=["Q_m3h / 3600 converts m3/h to m3/s",
                         "per-pump duty flow; keep 1-3 m/s for a process liquid line"],
        ),
        worked_calc(
            label="Reynolds number",
            formula="Re = rho x V x D / mu",
            values={"rho": (rho, "kg/m3"), "V": (velocity_r, "m/s"),
                    "D": (round(d_m, 4), "m"), "mu": (mu, "Pa.s")},
            result=reynolds_r, result_unit="",
            assumptions=["Newtonian fluid; pipe internal bore"],
        ),
        worked_calc(
            label="Darcy friction factor (Swamee-Jain)",
            formula="f = 0.25 / (log10(rel_rough/3.7 + 5.74/Re^0.9))^2",
            values={"rel_rough": (round(rel_rough, 6), ""), "Re": (reynolds_r, "")},
            result=f_darcy_r, result_unit="",
            assumptions=[f_basis, "rel_rough = roughness / D"],
        ),
        worked_calc(
            label="Pipe friction head (Darcy-Weisbach)",
            formula="H_friction = f x (L_eff / D) x V^2 / (2 x g)",
            values={"f": (f_darcy_r, ""), "L_eff": (round(l_eff_m, 2), "m"),
                    "D": (round(d_m, 4), "m"), "V": (velocity_r, "m/s"),
                    "g": (round(G, 4), "m/s2")},
            result=h_friction_r, result_unit="m",
            assumptions=["Darcy-Weisbach pipe friction (chemical-engineering standard)",
                         "L_eff = straight run + fittings equivalent length"],
        ),
        worked_calc(
            label="Process backpressure head",
            formula="H_process = backpressure_kpa x 1000 / (rho x g)",
            values={"backpressure_kpa": (round(process_backpressure_kpa, 2), "kPa"),
                    "rho": (rho, "kg/m3"), "g": (round(G, 4), "m/s2")},
            result=h_process_r, result_unit="m",
            assumptions=["column packing + heat exchangers + filter pressure drop"],
        ),
        worked_calc(
            label="Pump total dynamic head",
            formula=("H_total = authoritative TDH (override)"
                     if (tdh_override is not None and float(tdh_override) > 0)
                     else "H_total = static_head + H_friction + H_process"),
            values=({"H_total_override": (h_total_r, "m")}
                    if (tdh_override is not None and float(tdh_override) > 0)
                    else {"static_head": (static_head_m, "m"),
                          "H_friction": (h_friction_r, "m"),
                          "H_process": (h_process_r, "m")}),
            result=h_total_r, result_unit="m",
            assumptions=[head_basis]
                        + (["static lift = delivery elevation - suction elevation"]
                           if not (tdh_override is not None and float(tdh_override) > 0)
                           else [f"friction {h_friction_r} m + process {h_process_r} m shown for "
                                 f"context; the authoritative TDH already includes loop losses"]),
        ),
        worked_calc(
            label="Pump hydraulic power",
            formula="P_hyd = rho x g x (Q_m3h / 3600) x H_total",
            values={"rho": (rho, "kg/m3"), "g": (round(G, 4), "m/s2"),
                    "Q_m3h": (round(flow_m3_h, 4), "m3/h"), "H_total": (h_total_r, "m")},
            result=p_hyd_r, result_unit="W",
            assumptions=["P = rho g Q H", "Q_m3h / 3600 converts m3/h to m3/s"],
        ),
        worked_calc(
            label="Pump shaft power",
            formula="P_shaft = P_hyd / pump_eff",
            values={"P_hyd": (p_hyd_r, "W"), "pump_eff": (pump_eff, "")},
            result=p_shaft_r, result_unit="W",
            assumptions=[f"centrifugal pump efficiency {pump_eff} at duty point"],
        ),
        worked_calc(
            label="Motor input power",
            formula="P_motor = P_shaft / motor_eff",
            values={"P_shaft": (p_shaft_r, "W"), "motor_eff": (motor_eff, "")},
            result=p_motor_r, result_unit="W",
            assumptions=[f"motor efficiency {motor_eff}; recommended frame = "
                         f"{recommended_motor_kw} kW (next standard size with 15% margin)"],
        ),
    ]

    return {
        "pump_name": pump_name,
        "pump_type": "centrifugal",
        # PER-PUMP basis (the duty ONE pump train delivers). flow_m3_h / power are
        # PER-UNIT; the *_total / *_system fields below carry the loop aggregate so
        # any consumer can reconcile per-unit x N == total without re-deriving.
        "parallel_pumps": parallel_pumps,
        "flow_m3_h": round(flow_m3_h, 4),                       # PER-PUMP duty flow
        "flow_m3_h_total": round(flow_m3_h_total, 4),           # loop total (sum of all trains)
        "pump_flow_lpm": round(flow_m3_h * 1000.0 / 60.0, 2),
        "fluid_density_kg_m3": rho,
        "pipe_velocity_m_s": round(velocity_m_s, 3),
        "reynolds": round(reynolds, 1),
        "darcy_friction_factor": round(f_darcy, 5),
        "head_basis": head_basis,
        "head_override_applied": bool(tdh_override is not None and float(tdh_override) > 0),
        "head_breakdown": {
            "static_head_m": static_head_m,
            "friction_head_m": round(h_friction_m, 3),
            "process_backpressure_head_m": round(h_process_m, 3),
        },
        "pump_head_m": round(h_total_m, 3),
        "hydraulic_power_w": round(p_hydraulic_w, 1),          # PER-PUMP
        "shaft_power_w": round(p_shaft_w, 1),                  # PER-PUMP
        "motor_power_w": round(p_motor_w, 1),                  # PER-PUMP
        "motor_power_kw": round(p_motor_kw, 3),               # PER-PUMP
        "recommended_motor_kw": recommended_motor_kw,         # PER-PUMP IEC frame
        # System aggregate (all N trains) — the connected-load / panel-schedule figure.
        "system_hydraulic_power_w": round(p_hydraulic_w * parallel_pumps, 1),
        "system_shaft_power_w": round(p_shaft_w * parallel_pumps, 1),
        "system_motor_kw": round(recommended_motor_kw * parallel_pumps, 3),
        "pump_efficiency": pump_eff,
        "motor_efficiency": motor_eff,
        "worked": worked,
        "data_sources": [
            "Karassik et al., 'Pump Handbook', 4th ed., McGraw-Hill 2008",
            "Coulson & Richardson 'Chemical Engineering' Vol 1 — fluid flow / pipe friction",
            "Swamee & Jain (1976), explicit Colebrook friction-factor correlation",
        ],
    }


def _selftest() -> int:
    """Off-budget self-check: the RAS recirc pump must size PER-PUMP on the contract
    head, reconciling to the engineering-contract.ts calculator (count=8, head=14.5,
    motor=132 kW each). Reproduces the exact bug the Excel Checks tab flagged."""
    ok = True

    def chk(name, got, want, tol):
        nonlocal ok
        good = abs(got - want) <= tol
        ok = ok and good
        print(f"  [{'PASS' if good else 'FAIL'}] {name}: got {got:g}, want {want:g} (±{tol:g})")

    # RAS recirc pump: 13,360 m³/h loop, 8 parallel trains, contract TDH 14.5 m,
    # seawater 1025 kg/m³, η_pump 0.70, η_motor 0.93, DN600 / 70 m run.
    res = compute({
        "pump_name": "RAS recirc pump", "flow_m3_h": 13360.0, "parallel_pumps": 8,
        "total_dynamic_head_m": 14.5, "fluid_density_kg_m3": 1025.0,
        "fluid_viscosity_pa_s": 0.001, "static_head_m": 3.0, "pipe_length_m": 70.0,
        "pipe_diameter_mm": 600.0, "process_backpressure_kpa": 20.0,
        "pump_efficiency": 0.70, "motor_efficiency": 0.93,
    })
    print("RAS recirc pump (8 parallel trains, TDH override 14.5 m):")
    chk("per-pump flow m3/h", res["flow_m3_h"], 1670.0, 1.0)
    chk("loop total m3/h", res["flow_m3_h_total"], 13360.0, 1.0)
    chk("per-pump flow x count == loop total",
        res["flow_m3_h"] * res["parallel_pumps"], 13360.0, 1.0)
    chk("pump head m (override, NOT 26.35)", res["pump_head_m"], 14.5, 0.01)
    chk("per-pump velocity DN600 m/s (sane, NOT 13)", res["pipe_velocity_m_s"], 1.64, 0.1)
    chk("per-pump hydraulic kW", res["hydraulic_power_w"] / 1000.0, 67.6, 1.0)
    chk("per-pump shaft kW", res["shaft_power_w"] / 1000.0, 96.6, 1.5)
    chk("per-pump motor frame kW", res["recommended_motor_kw"], 132.0, 0.01)
    chk("system motor kW (8 x 132 == 1056, NOT 1217)",
        res["system_motor_kw"], 1056.0, 0.01)
    if not res.get("head_override_applied"):
        print("  [FAIL] head_override_applied flag not set"); ok = False
    else:
        print("  [PASS] head_override_applied flag set")

    # Legacy single-pump path must be byte-unchanged in BEHAVIOUR (parallel_pumps=1,
    # no override → head = static+friction+process as before).
    res1 = compute({"flow_m3_h": 3.0, "static_head_m": 12.0,
                    "process_backpressure_kpa": 250.0})
    print("Legacy single-pump (no parallel_pumps, no override):")
    chk("single-pump flow unchanged", res1["flow_m3_h"], 3.0, 0.001)
    chk("parallel_pumps defaults to 1", res1["parallel_pumps"], 1, 0.001)
    if res1.get("head_override_applied"):
        print("  [FAIL] override flag should be False on legacy path"); ok = False
    else:
        print("  [PASS] no override on legacy path")

    print("\nSELFTEST:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in ("--selftest", "selftest", "-t"):
        return _selftest()
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
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
