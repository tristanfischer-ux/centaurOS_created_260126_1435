#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/control_systems_run.py

Control-system analysis + PID tuning using the `python-control` library
(BSD, PyPI package name `control`). Reads JSON from stdin, writes JSON
to stdout.

Provides classical control analysis for any LTI plant supplied as a
numerator/denominator transfer function:
  - Stability via poles & gain/phase margins
  - PID tuning via Ziegler-Nichols, Cohen-Coon, AMIGO, IMC (lambda tuning)
  - Closed-loop step response: rise time, settling time, peak overshoot
  - Bandwidth and DC gain
  - Sensitivity & complementary-sensitivity peaks (M_s, M_T)

Input:
    {
      "plant_numerator": [1.0],
      "plant_denominator": [1.0, 2.0, 1.0],  # 1/(s^2 + 2s + 1)
      "tuning_method": "imc",                # ziegler_nichols | cohen_coon | amigo | imc
      "target_response": "settling_time",    # overshoot_pct | settling_time | rise_time
      "target_value": 4.0,                   # settling_time s OR overshoot % OR rise_time s
      "lambda_imc_s": 1.0,                   # IMC time-constant (smaller = more aggressive)
      "controller_type": "PID"               # P | PI | PID
    }

Output:
    {
      "kp": 1.0,
      "ki": 0.5,
      "kd": 0.0,
      "tuning_method_used": "imc",
      "controller_type": "PID",
      "bandwidth_hz": 0.10,
      "phase_margin_deg": 60.5,
      "gain_margin_db": 12.3,
      "settling_time_s": 4.0,
      "rise_time_s": 1.05,
      "peak_overshoot_pct": 4.6,
      "closed_loop_dc_gain": 1.0,
      "stable": true,
      "_provenance": {...}
    }

License: BSD-3-Clause (python-control)
Source:  https://github.com/python-control/python-control
Paper:   Murray, Astrom, Murray (2008-2024), "Python Control Systems Library",
         IFAC World Congress Proceedings.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice, safe_float_list  # noqa: E402  (FAIL-SOFT: off-vocab categorical / string-wired list)
from _worked import worked_calc  # noqa: E402  (same-dir shared helper — drift-safe worked calculations)

PROVENANCE = {
    "tool_name": "python-control",
    "tool_version": "0.10.2",
    "tool_license": "BSD-3-Clause",
    "tool_source_url": "https://github.com/python-control/python-control",
    "tool_paper": "Fuller, Greiner, Hedengren, Hedrick, Murray, Petersson, Powers, Salah (2021), 'The Python Control Systems Library (python-control)', 60th IEEE Conf. Decision and Control",
    "tool_doi": "10.1109/CDC45484.2021.9683368",
    "physics_basis": "Linear time-invariant system analysis: poles/zeros, gain/phase margins (Nyquist/Bode), step response. PID tuning rules from Ziegler-Nichols (1942), Cohen-Coon (1953), AMIGO (Astrom & Hagglund 2004), and IMC (Skogestad 2003).",
    "physics_paper_doi": "10.1016/S0167-6911(03)00237-X",  # Skogestad IMC
    "confidence_class": "library",
    "embedded_constants": {
        "ZN_OPEN_LOOP_COEFFS": {
            "source": "Ziegler & Nichols (1942), 'Optimum settings for automatic controllers', Trans. ASME 64:759-768.",
            "confidence": "standard",
        },
        "AMIGO_COEFFS": {
            "source": "Astrom & Hagglund (2004), 'Revisiting the Ziegler-Nichols step response method for PID control', J. Process Control 14(6):635.",
            "confidence": "standard",
        },
        "IMC_LAMBDA_DEFAULT": {
            "source": "Skogestad (2003) IMC-based 'SIMC' tuning rules — λ = τ_dominant for moderate response.",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def fit_foptd(num: list[float], den: list[float]) -> tuple[float, float, float, float | None, float | None]:
    """
    First-Order-Plus-Dead-Time (FOPTD) approximation:
        G(s) ≈ K * exp(-θ s) / (τ s + 1)
    Returns (K, τ, θ, t_28, t_63) — the two Smith-method response times are
    surfaced so the worked[] appendix can show the τ/θ fit by hand (None when
    the fit fell back / clamped and the two-point formula does not hold).

    Method: identify FOPTD parameters from step response of full plant.
    Used for Ziegler-Nichols, Cohen-Coon, AMIGO tuning that take FOPTD inputs.
    """
    import numpy as np
    import control as ct

    sys = ct.tf(num, den)
    # Step response
    t, y = ct.step_response(sys, T=np.linspace(0, 50, 5001))
    y_final = y[-1]
    if abs(y_final) < 1e-9:
        # Pure differentiator or unstable — can't fit FOPTD
        return 1.0, 1.0, 0.0, None, None

    K = float(y_final)
    # 28% response time and 63% response time per Smith's two-point method
    y_28 = 0.283 * K
    y_63 = 0.632 * K
    # Find earliest time where y exceeds these thresholds (assume monotonic-ish)
    sign = 1 if K > 0 else -1
    try:
        idx_28 = int(np.where(sign * y >= sign * y_28)[0][0])
        t_28 = float(t[idx_28])
    except IndexError:
        t_28 = float(t[-1])
    try:
        idx_63 = int(np.where(sign * y >= sign * y_63)[0][0])
        t_63 = float(t[idx_63])
    except IndexError:
        t_63 = float(t[-1])

    # Smith's method: τ = 1.5 × (t_63 - t_28), θ = t_63 - τ
    tau = 1.5 * (t_63 - t_28)
    theta = t_63 - tau
    clamped = False
    if tau <= 0:
        tau = max(0.01, t_63)
        clamped = True
    if theta < 0:
        theta = 0.0  # no dead time detected
        clamped = True
    # When either value was clamped the two-point formula no longer reproduces the
    # returned τ/θ — suppress the response times so no misleading working is printed.
    return K, tau, theta, (None if clamped else t_28), (None if clamped else t_63)


def tune_pid(method: str, K: float, tau: float, theta: float,
             controller_type: str, lambda_imc: float = 1.0) -> tuple[float, float, float, dict]:
    """Return (Kp, Ki, Kd, info) per the requested tuning method.
    Inputs are FOPTD parameters K, tau, theta. theta=0 forces lambda or
    method-specific fallback.

    `info` carries the LIVE per-branch tuning-rule formula + values (kp_formula /
    kp_values / kp_assumptions, plus Ti and Td) so compute() can print a
    drift-safe worked[] record — the formula string is authored HERE, next to the
    arithmetic it describes, never re-derived in the renderer (the documented
    "two copies drift apart" failure family)."""
    # Avoid division by zero in theta-based methods
    theta_safe = max(0.01, theta)

    method = method.lower()
    controller_type = controller_type.upper()

    kp_assumptions: list[str] = []
    if method == "ziegler_nichols":
        # ZN open-loop (step) tuning
        # FOPTD: Kp = (1.2 * tau) / (K * theta) for PID, etc.
        kp_values = {"K": (round(max(1e-6, K), 6), ""), "tau": (round(tau, 6), "s"),
                     "theta": (round(theta_safe, 6), "s")}
        kp_assumptions.append("Ziegler-Nichols open-loop step rule on the fitted FOPTD plant")
        if controller_type == "P":
            Kp = tau / (max(1e-6, K) * theta_safe)
            Ti = 1e9; Td = 0.0
            kp_formula = "Kp = tau / (K x theta)"
        elif controller_type == "PI":
            Kp = (0.9 * tau) / (max(1e-6, K) * theta_safe)
            Ti = theta_safe / 0.3
            Td = 0.0
            kp_formula = "Kp = 0.9 x tau / (K x theta)"
        else:  # PID
            Kp = (1.2 * tau) / (max(1e-6, K) * theta_safe)
            Ti = 2.0 * theta_safe
            Td = 0.5 * theta_safe
            kp_formula = "Kp = 1.2 x tau / (K x theta)"
    elif method == "cohen_coon":
        # Cohen-Coon for FOPTD plants
        r = theta_safe / tau if tau > 0 else 1.0
        kp_values = {"K": (round(K, 6), ""), "r": (round(r, 6), "")}
        kp_assumptions.append(f"Cohen-Coon rule; r = theta / tau = {round(theta_safe, 4)} / {round(tau, 4)}")
        if controller_type == "P":
            Kp = (1.0 / (K * r)) * (1 + r/3)
            Ti = 1e9; Td = 0.0
            kp_formula = "Kp = (1 / (K x r)) x (1 + r / 3)"
        elif controller_type == "PI":
            Kp = (1.0 / (K * r)) * (0.9 + r/12)
            Ti = theta_safe * (30 + 3*r) / (9 + 20*r)
            Td = 0.0
            kp_formula = "Kp = (1 / (K x r)) x (0.9 + r / 12)"
        else:  # PID
            Kp = (1.0 / (K * r)) * (1.35 + r/4)
            Ti = theta_safe * (32 + 6*r) / (13 + 8*r)
            Td = theta_safe * 4 / (11 + 2*r)
            kp_formula = "Kp = (1 / (K x r)) x (1.35 + r / 4)"
    elif method == "amigo":
        # AMIGO (Astrom-Hagglund 2004) for FOPTD
        kp_values = {"K": (round(max(1e-6, K), 6), ""), "tau": (round(tau, 6), "s"),
                     "theta": (round(theta_safe, 6), "s")}
        kp_assumptions.append("AMIGO rule (Astrom & Hagglund 2004) on the fitted FOPTD plant")
        if controller_type == "PI":
            Kp = (0.15 / max(1e-6, K)) + (0.35 - (theta_safe*tau)/((theta_safe+tau)**2)) * (tau / (max(1e-6, K) * theta_safe))
            Ti = (0.35*theta_safe + 13*tau*theta_safe**2/(tau**2 + 12*tau*theta_safe + 7*theta_safe**2))
            Td = 0.0
            kp_formula = "Kp = 0.15 / K + (0.35 - (theta x tau) / (theta + tau)^2) x (tau / (K x theta))"
        else:  # PID (default)
            Kp = (1.0 / max(1e-6, K)) * (0.2 + 0.45 * tau / theta_safe)
            Ti = (0.4*theta_safe + 0.8*tau) / (theta_safe + 0.1*tau) * theta_safe
            Td = 0.5 * theta_safe * tau / (0.3 * theta_safe + tau)
            kp_formula = "Kp = (1 / K) x (0.2 + 0.45 x tau / theta)"
    elif method == "imc" or method == "lambda":
        # IMC / Skogestad SIMC: aggressiveness controlled by lambda
        # For PID on FOPTD: Kp = (1/K) * tau/(lambda + theta)
        # Ti = min(tau, 4*(lambda + theta)); Td = 0 for FOPTD, or tau*theta/(tau+theta) for SOPTD
        L = lambda_imc
        kp_values = {"K": (round(max(1e-6, K), 6), ""), "tau": (round(tau, 6), "s"),
                     "theta": (round(theta_safe, 6), "s"), "L": (round(L, 6), "s")}
        kp_assumptions.append("IMC / Skogestad SIMC rule; L = the IMC lambda time-constant")
        if controller_type == "P":
            Kp = (1.0 / max(1e-6, K)) * tau / (L + theta_safe)
            Ti = 1e9; Td = 0.0
        elif controller_type == "PI":
            Kp = (1.0 / max(1e-6, K)) * tau / (L + theta_safe)
            Ti = min(tau, 4*(L + theta_safe))
            Td = 0.0
        else:  # PID
            Kp = (1.0 / max(1e-6, K)) * tau / (L + theta_safe)
            Ti = min(tau, 4*(L + theta_safe))
            Td = tau * theta_safe / (tau + theta_safe) if theta > 0 else 0.0
        kp_formula = "Kp = (1 / K) x tau / (L + theta)"
    else:
        raise ValueError(f"unknown tuning_method: {method!r}")

    Ki = Kp / Ti if Ti > 0 else 0.0
    Kd = Kp * Td if Td > 0 else 0.0
    info = {"Ti": float(Ti), "Td": float(Td), "kp_formula": kp_formula,
            "kp_values": kp_values, "kp_assumptions": kp_assumptions}
    return float(Kp), float(Ki), float(Kd), info


def compute(payload: dict) -> dict:
    import numpy as np
    import control as ct

    # FAIL-SOFT: the planner may wire these as "1" / "1, 1" STRINGS, not arrays.
    num = safe_float_list(payload.get("plant_numerator"), default=[1.0], label="plant_numerator")
    den = safe_float_list(payload.get("plant_denominator"), default=[1.0, 2.0, 1.0], label="plant_denominator")
    method = safe_choice(str(payload.get("tuning_method", "imc")).lower(), ("ziegler_nichols", "cohen_coon", "amigo", "imc", "lambda"), default="imc", label="tuning_method")
    target_resp = str(payload.get("target_response", "settling_time")).lower()
    target_val = float(payload.get("target_value", 4.0))
    lambda_imc = float(payload.get("lambda_imc_s", 1.0))
    controller_type = str(payload.get("controller_type", "PID")).upper()

    plant = ct.tf(num, den)
    poles = ct.poles(plant)
    zeros = ct.zeros(plant)
    stable_open = all(p.real < 0 for p in poles)

    # Identify FOPTD parameters for tuning
    K, tau, theta, t_28, t_63 = fit_foptd(num, den)

    # Compute PID gains
    Kp, Ki, Kd, tune_info = tune_pid(method, K, tau, theta, controller_type, lambda_imc)

    # ── worked[] — the hand-checkable tuning maths (inputs → formula → result) ──
    # Built HERE from the SAME live values the gains were computed with (_worked.py
    # drift-safety contract); the Calculations tab renders these so a reviewer can
    # check e.g. ph_control_kp by hand. The per-method Kp rule comes from tune_pid
    # (authored next to its arithmetic); Ki/Kd follow from the standard parallel-
    # form identities Ki = Kp / Ti and Kd = Kp x Td.
    worked = []
    if t_28 is not None and t_63 is not None:
        worked.append(worked_calc(
            label="FOPTD time constant (Smith two-point fit)",
            formula="tau = 1.5 x (t63 - t28)",
            values={"t63": (round(t_63, 4), "s"), "t28": (round(t_28, 4), "s")},
            result=round(tau, 4), result_unit="s",
            assumptions=["Smith's method: 28.3% / 63.2% step-response times of the full plant"],
        ))
        worked.append(worked_calc(
            label="FOPTD dead time",
            formula="theta = t63 - tau",
            values={"t63": (round(t_63, 4), "s"), "tau": (round(tau, 4), "s")},
            result=round(theta, 4), result_unit="s",
            assumptions=["dead time from the same two-point FOPTD fit"],
        ))
    worked.append(worked_calc(
        label=f"Proportional gain ({method.upper()} {controller_type} rule)",
        formula=tune_info["kp_formula"],
        values=tune_info["kp_values"],
        result=round(Kp, 6), result_unit="",
        assumptions=tune_info["kp_assumptions"],
    ))
    if 0 < tune_info["Ti"] < 1e8:  # a real integral term (P controllers carry Ti=1e9 sentinel)
        worked.append(worked_calc(
            label="Integral gain",
            formula="Ki = Kp / Ti",
            values={"Kp": (round(Kp, 6), ""), "Ti": (round(tune_info["Ti"], 6), "s")},
            result=round(Ki, 6), result_unit="1/s",
            assumptions=[f"integral time Ti = {round(tune_info['Ti'], 4)} s from the {method.upper()} rule"],
        ))
    if tune_info["Td"] > 0:
        worked.append(worked_calc(
            label="Derivative gain",
            formula="Kd = Kp x Td",
            values={"Kp": (round(Kp, 6), ""), "Td": (round(tune_info["Td"], 6), "s")},
            result=round(Kd, 6), result_unit="s",
            assumptions=[f"derivative time Td = {round(tune_info['Td'], 4)} s from the {method.upper()} rule"],
        ))

    # Build PID controller transfer function
    # PID: Kp + Ki/s + Kd*s = (Kd*s^2 + Kp*s + Ki) / s
    if abs(Kd) > 1e-12:
        # Add derivative filter (1 + tau_d * s/N) with N = 10 for realisability
        N = 10.0
        tau_d = Kd / Kp if Kp != 0 else 0.0
        # PID with filter: Kp(1 + 1/(Ti s) + Td s/(1 + Td/N s))
        # We use parallel form: Kp + Ki/s + Kd*s/(1 + (Kd/(N*Kp))*s)
        num_c = [Kd + Kp * (tau_d / N), Kp + Ki * (tau_d / N), Ki]
        den_c = [tau_d / N, 1.0, 0.0]
    else:
        # PI controller
        num_c = [Kp, Ki]
        den_c = [1.0, 0.0]
    controller = ct.tf(num_c, den_c)

    # Open-loop L = C*G
    L = ct.series(controller, plant)
    # Margins
    try:
        gm, pm, wg, wp = ct.margin(L)
    except Exception:
        gm, pm, wg, wp = float("nan"), float("nan"), float("nan"), float("nan")
    gm_db = 20 * math.log10(gm) if (gm > 0 and not math.isinf(gm)) else float("inf")

    # Closed-loop T = L / (1 + L)
    T_cl = ct.feedback(L, 1)
    # Bandwidth
    try:
        bw_rad_s = ct.bandwidth(T_cl)
        bw_hz = float(bw_rad_s) / (2 * math.pi)
    except Exception:
        bw_hz = float("nan")

    # Step response
    t_grid = np.linspace(0, max(50.0, 5.0 * tau, 5.0 * target_val), 5001)
    t, y = ct.step_response(T_cl, T=t_grid)
    y_final = float(y[-1])
    dc_gain = y_final

    if abs(y_final) > 1e-6:
        peak_idx = int(np.argmax(np.abs(y)))
        peak_val = float(y[peak_idx])
        peak_overshoot_pct = max(0.0, (peak_val - y_final) / y_final * 100.0)

        # Rise time (10% -> 90%)
        try:
            idx_10 = int(np.where(np.abs(y) >= 0.1 * abs(y_final))[0][0])
            idx_90 = int(np.where(np.abs(y) >= 0.9 * abs(y_final))[0][0])
            rise_time_s = float(t[idx_90] - t[idx_10])
        except IndexError:
            rise_time_s = float("nan")

        # Settling time (2% band)
        settled = np.abs(y - y_final) <= 0.02 * abs(y_final)
        # Find latest index that is NOT yet settled and add 1
        not_settled_idx = np.where(~settled)[0]
        if len(not_settled_idx) > 0 and not_settled_idx[-1] + 1 < len(t):
            settling_time_s = float(t[not_settled_idx[-1] + 1])
        else:
            settling_time_s = float(t[-1])
    else:
        peak_overshoot_pct = float("nan")
        rise_time_s = float("nan")
        settling_time_s = float("nan")

    stable_closed = bool(np.all(y[-100:] - y_final < 100 * abs(y_final))) if abs(y_final) > 0 else stable_open

    return {
        "kp": round(Kp, 6),
        "ki": round(Ki, 6),
        "kd": round(Kd, 6),
        "tuning_method_used": method,
        "controller_type": controller_type,
        "foptd_K": round(K, 6),
        "foptd_tau_s": round(tau, 6),
        "foptd_theta_s": round(theta, 6),
        "lambda_imc_s": lambda_imc if method in ("imc", "lambda") else None,
        "bandwidth_hz": round(bw_hz, 4) if not math.isnan(bw_hz) else None,
        "bandwidth_rad_s": round(bw_hz * 2 * math.pi, 4) if not math.isnan(bw_hz) else None,
        "phase_margin_deg": round(float(pm), 3) if not math.isnan(pm) else None,
        "gain_margin_db": round(gm_db, 3) if not math.isinf(gm_db) and not math.isnan(gm_db) else "inf",
        "gain_margin_linear": round(float(gm), 4) if not math.isinf(gm) and not math.isnan(gm) else "inf",
        "settling_time_s": round(settling_time_s, 4) if not math.isnan(settling_time_s) else None,
        "rise_time_s": round(rise_time_s, 4) if not math.isnan(rise_time_s) else None,
        "peak_overshoot_pct": round(peak_overshoot_pct, 3) if not math.isnan(peak_overshoot_pct) else None,
        "closed_loop_dc_gain": round(dc_gain, 4),
        "open_loop_stable": stable_open,
        "closed_loop_stable": stable_closed,
        "stable": stable_closed,
        "plant_poles_real": [round(float(p.real), 4) for p in poles],
        "plant_poles_imag": [round(float(p.imag), 4) for p in poles],
        "plant_zeros_real": [round(float(z.real), 4) for z in zeros],
        "plant_zeros_imag": [round(float(z.imag), 4) for z in zeros],
        "controller_numerator": num_c,
        "controller_denominator": den_c,
        "target_response": target_resp,
        "target_value": target_val,
        "worked": worked,
        "_provenance": PROVENANCE,
    }


def _eval_arith(expr: str):
    """SAFE arithmetic evaluation via ast (NO eval — numbers and + - * / ** ( )
    unary-minus only; anything else → None). Mirrors the harness's no-eval
    evaluator in UNIVERSAL.worked_calc_arithmetic_sound."""
    import ast
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return None

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = ev(node.operand)
            return None if v is None else (-v if isinstance(node.op, ast.USub) else v)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            a, b = ev(node.left), ev(node.right)
            if a is None or b is None:
                return None
            try:
                if isinstance(node.op, ast.Add):
                    return a + b
                if isinstance(node.op, ast.Sub):
                    return a - b
                if isinstance(node.op, ast.Mult):
                    return a * b
                if isinstance(node.op, ast.Div):
                    return a / b
                return a ** b
            except (ZeroDivisionError, OverflowError):
                return None
        return None
    return ev(tree)


def _subst_holds(wc: dict, tol: float = 0.015) -> bool:
    """Re-evaluate a worked record's substituted expression and check it equals the
    stated result (the same check as harness UNIVERSAL.worked_calc_arithmetic_sound).
    Records whose expression uses a function (min/max/ceil/…) are skipped → True."""
    parts = str(wc.get("substitution", "")).split("=")
    if len(parts) < 3:
        return True
    expr = "=".join(parts[1:-1]).replace(",", "").replace("^", "**")
    expr = re.sub(r"(?<=[\d\s()])x(?=[\d\s(])", "*", expr)
    if re.search(r"[A-Za-z]", expr):  # function call / symbol left → not plainly evaluable
        return True
    got = _eval_arith(expr)
    if got is None:
        return True
    stated = (wc.get("result") or {}).get("value")
    try:
        stated = float(stated)
    except (TypeError, ValueError):
        return True
    return abs(got - stated) <= tol * max(abs(stated), 1e-9)


def _selftest() -> int:
    """proveCatch for the worked[] emission gap (routed residual, commit e74d4502e):
    the adversarial input is the v56d run — pid-tuning minted ph_control_kp with
    ZERO worked calculations, capping the Calculations tab at 7 tools. The default
    IMC PID plant MUST now emit a hand-checkable Kp/Ki/Kd working that adds up."""
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    out = compute({})  # default plant 1/(s^2+2s+1), IMC PID — the v56d shape
    worked = out.get("worked") or []
    chk("worked_nonempty", len(worked) >= 3)
    labels = " | ".join(str(w.get("label")) for w in worked)
    chk("kp_worked_present", "Proportional gain" in labels)
    chk("ki_worked_present", "Integral gain" in labels)
    for w in worked:
        chk(f"arith_sound[{w.get('label')}]", _subst_holds(w))
        chk(f"shape[{w.get('label')}]", all(k in w for k in ("label", "formula", "substitution", "inputs", "result")))
    # every tuning method emits a Kp working (per-branch formula authored in tune_pid)
    for m in ("ziegler_nichols", "cohen_coon", "amigo", "imc"):
        o = compute({"tuning_method": m})
        wl = [w for w in (o.get("worked") or []) if "Proportional gain" in str(w.get("label"))]
        chk(f"kp_worked[{m}]", len(wl) == 1 and _subst_holds(wl[0]))

    if fails:
        print(f"[control_systems_run] SELFTEST FAIL: {', '.join(fails)}", file=sys.stderr)
        return 1
    print(f"[control_systems_run] selftest OK ({len(worked)} worked calcs on the default plant; all 4 tuning rules emit a hand-checkable Kp working)")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return _selftest()
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
