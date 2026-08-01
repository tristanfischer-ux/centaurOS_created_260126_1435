#!/usr/bin/env python3
"""Canonical shaft-torque identity for FIA front-kit EM + gear screens.

INTENT (red-team F-EM-2, 2026-07-31): one formula for required motor shaft
torque at continuous electrical duty / η / ω. Gear ISO / bevel / mount screens
must not drift from the EM analytical duty check (122.43 ideal vs 125.21 with η).

T_shaft = P_elec / (η_m · η_inv · ω)   with ω = n · 2π/60
T_ideal (η=1) = P_elec / ω            — diagnostic only; never the kit duty bar.
"""
from __future__ import annotations

import math
from typing import Any, Mapping

# GOTCHA: 0.96 × 0.98 = 0.9408 is the EM TwinInputs default product. Gear screens
# historically used 0.9777 as a single combined η — keep that as the kit ASSUMED
# combined seed so ISO / bevel stay byte-aligned with stamped artefacts.
ASSUMED_COMBINED_EFFICIENCY = 0.9777
DEFAULT_MACHINE_EFFICIENCY = 0.96
DEFAULT_INVERTER_EFFICIENCY = 0.98
# Peak interest bar (diagnostic). Duty PASS never uses peak alone.
DUTY_TORQUE_PEAK_INTEREST_RATIO = 0.75
# Mean must clear full required shaft torque for duty_torque_screen_ok.
DUTY_TORQUE_MEAN_CLEAR_RATIO = 1.0


def evaluate_duty_torque_screen_ok(
    *,
    required_shaft_torque_nm: float,
    peak_torque_magnitude_nm: float,
    mean_torque_magnitude_nm: float | None,
    torque_reliable: bool,
    mean_clear_ratio: float = DUTY_TORQUE_MEAN_CLEAR_RATIO,
    excitation_tracking_ok: bool | None = None,
) -> tuple[bool, dict[str, Any]]:
    """Decide duty_torque_screen_ok from mean + reliability — never peak alone.

    INTENT (red-team F-EM-1): peak FEMM ~207 N·m must not greenwash duty when
    position-sweep mean ~119 N·m sits below required ~125 N·m, or when
    torque_reliable is still false.

    ⭐ EXCITATION TRACKING (2026-08-01). A mean is only a mean if the sweep it
    came from measured ONE operating point. When the stator field walks past the
    rotor, torque swings through zero and the "mean" is an average over a
    machine that was never in synchronism — on the live FE front kit, mean|T|
    read 64.6 N·m while the DELIVERED mean was 3.75 and the deck's own back-EMF
    implied 131. Passing `excitation_tracking_ok=False` therefore BLOCKS the
    duty screen outright rather than letting a meaningless average be compared
    against the requirement. `None` means the screen was not run — that is
    recorded, and does not block, so older callers keep their behaviour.
    """
    required = float(required_shaft_torque_nm)
    peak = abs(float(peak_torque_magnitude_nm))
    peak_ratio = peak / required if required > 0.0 else 0.0
    mean_ratio: float | None = None
    fail_reasons: list[str] = []
    if not torque_reliable:
        fail_reasons.append("torque_reliable=false")
    if excitation_tracking_ok is False:
        fail_reasons.append("excitation_not_tracking_rotor")
    if mean_torque_magnitude_nm is None:
        fail_reasons.append("no_position_sweep_mean")
    else:
        mean_mag = abs(float(mean_torque_magnitude_nm))
        mean_ratio = mean_mag / required if required > 0.0 else 0.0
        if mean_ratio < mean_clear_ratio:
            fail_reasons.append(
                f"mean_ratio={mean_ratio:.4f}<{mean_clear_ratio}"
            )
    duty_ok = len(fail_reasons) == 0
    return duty_ok, {
        "duty_torque_screen_ok": duty_ok,
        "torque_reliable": bool(torque_reliable),
        "required_shaft_torque_nm": required,
        "peak_torque_magnitude_nm": peak,
        "peak_torque_vs_required_ratio": round(peak_ratio, 6),
        "mean_torque_magnitude_nm": (
            None
            if mean_torque_magnitude_nm is None
            else abs(float(mean_torque_magnitude_nm))
        ),
        "mean_torque_vs_required_ratio": (
            None if mean_ratio is None else round(mean_ratio, 6)
        ),
        "mean_clear_ratio": mean_clear_ratio,
        "excitation_tracking_ok": excitation_tracking_ok,
        "peak_interest_ratio_threshold": DUTY_TORQUE_PEAK_INTEREST_RATIO,
        "peak_interest_ok": peak_ratio >= DUTY_TORQUE_PEAK_INTEREST_RATIO,
        "fail_reasons": fail_reasons,
    }


def omega_rad_s(rpm: float) -> float:
    """Mechanical angular speed from rpm."""
    return float(rpm) * 2.0 * math.pi / 60.0


def required_shaft_torque_nm(
    *,
    continuous_electrical_power_kw: float,
    max_rotor_speed_rpm: float,
    machine_efficiency: float = DEFAULT_MACHINE_EFFICIENCY,
    inverter_efficiency: float = DEFAULT_INVERTER_EFFICIENCY,
    combined_efficiency: float | None = None,
) -> float:
    """Required mechanical shaft torque at continuous electrical duty.

    @description P_shaft = P_elec / η_combined; T = P_shaft / ω.
    @param continuous_electrical_power_kw Electrical continuous duty (kW).
    @param max_rotor_speed_rpm Rotor speed at the duty point (rpm).
    @param machine_efficiency η_m when combined_efficiency is None.
    @param inverter_efficiency η_inv when combined_efficiency is None.
    @param combined_efficiency Optional single η product (gear-screen seed).
    @returns Shaft torque in N·m.
    @throws ValueError when speed or efficiency is non-positive.
    """
    omega = omega_rad_s(max_rotor_speed_rpm)
    if omega <= 0.0:
        raise ValueError("max_rotor_speed_rpm must be positive")
    if combined_efficiency is None:
        eta = float(machine_efficiency) * float(inverter_efficiency)
    else:
        eta = float(combined_efficiency)
    if eta <= 0.0:
        raise ValueError("efficiency must be positive")
    shaft_power_w = float(continuous_electrical_power_kw) * 1000.0 / eta
    return shaft_power_w / omega


def ideal_shaft_torque_nm_full_electrical(
    *,
    continuous_electrical_power_kw: float,
    max_rotor_speed_rpm: float,
) -> float:
    """T = P_elec / ω with η=1 — diagnostic identity, not the kit duty bar."""
    return required_shaft_torque_nm(
        continuous_electrical_power_kw=continuous_electrical_power_kw,
        max_rotor_speed_rpm=max_rotor_speed_rpm,
        combined_efficiency=1.0,
    )


def torque_identity_report(
    *,
    continuous_electrical_power_kw: float = 250.0,
    max_rotor_speed_rpm: float = 19_500.0,
) -> Mapping[str, float]:
    """Numbers a skeptic must reconcile (ideal vs assumed-η kit duty)."""
    ideal = ideal_shaft_torque_nm_full_electrical(
        continuous_electrical_power_kw=continuous_electrical_power_kw,
        max_rotor_speed_rpm=max_rotor_speed_rpm,
    )
    kit = required_shaft_torque_nm(
        continuous_electrical_power_kw=continuous_electrical_power_kw,
        max_rotor_speed_rpm=max_rotor_speed_rpm,
        combined_efficiency=ASSUMED_COMBINED_EFFICIENCY,
    )
    em_default = required_shaft_torque_nm(
        continuous_electrical_power_kw=continuous_electrical_power_kw,
        max_rotor_speed_rpm=max_rotor_speed_rpm,
        machine_efficiency=DEFAULT_MACHINE_EFFICIENCY,
        inverter_efficiency=DEFAULT_INVERTER_EFFICIENCY,
    )
    return {
        "omega_rad_s": round(omega_rad_s(max_rotor_speed_rpm), 4),
        "t_ideal_nm_eta_1": round(ideal, 3),
        "t_kit_nm_eta_assumed_combined": round(kit, 3),
        "t_em_nm_eta_machine_x_inverter": round(em_default, 3),
        "assumed_combined_efficiency": ASSUMED_COMBINED_EFFICIENCY,
    }


def _selftest() -> int:
    """proveCatch: 250 kW / 19_500 rpm identities + F-EM-1 duty screen."""
    report = torque_identity_report()
    # Ideal ≈ 122.43; kit η=0.9777 ≈ 125.21; EM 0.96×0.98 ≈ 130.1
    if not (122.0 < report["t_ideal_nm_eta_1"] < 123.0):
        print(f"FAIL ideal torque identity: {report}")
        return 1
    if not (124.5 < report["t_kit_nm_eta_assumed_combined"] < 126.0):
        print(f"FAIL kit combined-η identity: {report}")
        return 1
    kit_via_helper = required_shaft_torque_nm(
        continuous_electrical_power_kw=250.0,
        max_rotor_speed_rpm=19_500.0,
        combined_efficiency=ASSUMED_COMBINED_EFFICIENCY,
    )
    if abs(kit_via_helper - report["t_kit_nm_eta_assumed_combined"]) > 0.02:
        print("FAIL helper/report drift")
        return 1
    # Twin red-team numbers: peak high, mean below required, unreliable → False
    bad_ok, _ = evaluate_duty_torque_screen_ok(
        required_shaft_torque_nm=125.21,
        peak_torque_magnitude_nm=207.12,
        mean_torque_magnitude_nm=118.75,
        torque_reliable=False,
    )
    if bad_ok:
        print("FAIL: peak-alone greenwash must not pass duty screen")
        return 1
    good_ok, _ = evaluate_duty_torque_screen_ok(
        required_shaft_torque_nm=125.21,
        peak_torque_magnitude_nm=207.12,
        mean_torque_magnitude_nm=130.0,
        torque_reliable=True,
    )
    if not good_ok:
        print("FAIL: reliable mean≥required must pass duty screen")
        return 1
    print(f"shaft_torque_identity selftest OK {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_selftest())
