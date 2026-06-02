#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ev_battery_charging_curve.py

CCS DC fast charging curve model for EV battery packs. Reads JSON from
stdin, writes JSON to stdout.

Input:
    {
      "battery_kwh": 60.0,
      "soc_start_pct": 20.0,
      "soc_target_pct": 80.0,
      "max_power_kw": 150.0,             # charger output cap
      "battery_chemistry": "NMC",        # "NMC"|"LFP"|"NCA"|"LMO"
      "battery_temp_c": 25.0
    }

Output:
    {
      "actual_max_power_per_soc_kw": [[20, 150], [50, 130], ...],
      "total_charge_time_minutes": 32,
      "energy_delivered_kwh": 36,
      "peak_c_rate": 2.5,
      ...
    }

Physics: empirical CCS DC fast-charging curve. Real EV charge profiles
taper from a peak power plateau to a much lower trickle as the cell
voltage approaches 4.2V (NMC/NCA) or 3.65V (LFP). The taper is
chemistry-, temperature-, and pack-design-dependent.

Empirical taper curve (typical Porsche Taycan, Hyundai Ioniq 5, Tesla
Model 3 LR profiles):
- NMC/NCA: holds peak from SOC ~10-50%, tapers linearly from 50-80%,
  then steep taper 80-100%.
- LFP: flatter, holds peak longer (~10-70%), then taper.

Temperature derating: <10°C drops peak by 50%+; >40°C also derates due
to BMS protection.

References:
- Argonne National Lab "Fast Charging EV" test data (2021-2023)
- Idaho National Lab BatteryPlus testing
- NREL Tech-to-Market reports on DC fast charging
- Wassiliadis et al., J Energy Storage 2021 — "Review of fast charging strategies"
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'ev_battery_charging_curve (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Argonne National Lab FCEV technical data; Idaho National Lab BatteryPlus database; Wassiliadis et al. (2021), 'Review of fast charging strategies for lithium-ion battery systems', J. Energy Storage 44:103306",
    "physics_basis": 'Constant-current taper at SoC > taper-knee until V_max reached, then constant-voltage. Knee per chemistry: LFP at 70-80% SoC, NMC at 30-50%.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Empirical taper coefficients per chemistry. Each row is a (soc_pct,
# power_fraction) point; the model linearly interpolates between them.
TAPER_CURVES = {
    "NMC": [
        # Below 10% SOC: rapid ramp to peak as cells warm.
        # Tesla Model 3 SR / Hyundai Kona 60 kWh real-world curves.
        (0.0, 0.40),
        (5.0, 0.65),
        (10.0, 0.85),
        (30.0, 0.85),  # plateau
        (40.0, 0.70),
        (50.0, 0.55),
        (60.0, 0.40),
        (70.0, 0.30),
        (80.0, 0.22),
        (90.0, 0.13),
        (100.0, 0.05),
    ],
    "NCA": [
        # Tesla NCA profile (Model S/X/3 LR)
        (0.0, 0.55),
        (5.0, 0.90),
        (10.0, 1.00),
        (40.0, 1.00),
        (55.0, 0.80),
        (70.0, 0.55),
        (80.0, 0.38),
        (90.0, 0.20),
        (100.0, 0.05),
    ],
    "LFP": [
        # BYD Blade, Tesla LFP, Ioniq 5 LFP
        (0.0, 0.60),
        (5.0, 0.85),
        (10.0, 1.00),
        (65.0, 1.00),  # holds peak longer
        (75.0, 0.85),
        (85.0, 0.60),
        (95.0, 0.30),
        (100.0, 0.10),
    ],
    "LMO": [
        # Older Nissan Leaf chemistry
        (0.0, 0.40),
        (5.0, 0.70),
        (10.0, 0.85),
        (30.0, 0.85),
        (50.0, 0.65),
        (70.0, 0.45),
        (80.0, 0.30),
        (90.0, 0.15),
        (100.0, 0.05),
    ],
}


def interpolate_taper(soc: float, chemistry: str) -> float:
    """Linear interp between sample points of the taper curve."""
    if chemistry not in TAPER_CURVES:
        chemistry = "NMC"
    curve = TAPER_CURVES[chemistry]
    if soc <= curve[0][0]:
        return curve[0][1]
    if soc >= curve[-1][0]:
        return curve[-1][1]
    for i in range(1, len(curve)):
        if curve[i - 1][0] <= soc <= curve[i][0]:
            x0, y0 = curve[i - 1]
            x1, y1 = curve[i]
            t = (soc - x0) / (x1 - x0) if x1 != x0 else 0
            return y0 + t * (y1 - y0)
    return curve[-1][1]


def temperature_derate(temp_c: float, chemistry: str) -> float:
    """Battery-temperature-based power derating factor."""
    # Below 0°C: severe derate (lithium plating risk)
    # 10-30°C: full power
    # 35-45°C: still ~95%
    # Above 50°C: BMS may halt charging
    if temp_c < -10:
        return 0.10
    if temp_c < 0:
        return 0.25 + 0.025 * (temp_c + 10)  # 0.25 at -10, 0.50 at 0
    if temp_c < 10:
        return 0.50 + 0.05 * (temp_c)  # 0.50 at 0, 1.00 at 10
    if temp_c < 35:
        return 1.0
    if temp_c < 50:
        return 1.0 - 0.03 * (temp_c - 35)  # gentle decline
    return 0.30


def compute(payload: dict) -> dict:
    battery_kwh = float(payload.get("battery_kwh", 60.0))
    soc_start = float(payload.get("soc_start_pct", 20.0))
    soc_target = float(payload.get("soc_target_pct", 80.0))
    max_power_kw = float(payload.get("max_power_kw", 150.0))
    chemistry = str(payload.get("battery_chemistry", "NMC"))
    temp_c = float(payload.get("battery_temp_c", 25.0))

    if soc_target <= soc_start:
        return {
            "error": f"soc_target ({soc_target}) must exceed soc_start ({soc_start})"
        }

    temp_factor = temperature_derate(temp_c, chemistry)

    # March SOC in 1% increments, accumulate time
    # dt = dSOC × battery_kwh / power_kw
    SOC_STEP = 1.0
    total_time_hours = 0.0
    energy_delivered_kwh = 0.0
    power_curve = []  # (soc_pct, kw) samples for output
    peak_power_kw = 0.0

    soc = soc_start
    while soc < soc_target:
        taper = interpolate_taper(soc, chemistry)
        # The cap from the charger is the lesser of (charger output max,
        # battery-allowed power for this SOC, temp-derated)
        power_kw = min(max_power_kw, max_power_kw * taper) * temp_factor
        # The taper is relative to *the* peak — pack peak is max_power_kw × 1.0
        # so the real cap at this SOC is max_power_kw * taper * temp_factor
        # but never above max_power_kw (charger limit)
        power_kw = min(max_power_kw, max_power_kw * taper * temp_factor)

        if power_kw < 0.1:
            power_kw = 0.1  # epsilon to avoid div-zero, also reality (no zero charge)

        # Energy added in this step
        delta_kwh = SOC_STEP * battery_kwh / 100.0
        delta_time_hours = delta_kwh / power_kw

        total_time_hours += delta_time_hours
        energy_delivered_kwh += delta_kwh
        power_curve.append([round(soc, 1), round(power_kw, 2)])

        if power_kw > peak_power_kw:
            peak_power_kw = power_kw

        soc += SOC_STEP

    # Final entry at target SOC
    final_taper = interpolate_taper(soc_target, chemistry)
    final_power = min(max_power_kw, max_power_kw * final_taper * temp_factor)
    power_curve.append([round(soc_target, 1), round(final_power, 2)])

    total_time_minutes = total_time_hours * 60.0
    avg_power_kw = energy_delivered_kwh / total_time_hours if total_time_hours > 0 else 0.0
    peak_c_rate = peak_power_kw / battery_kwh

    peak_c_rate_r = round(peak_c_rate, 3)
    peak_power_r = round(peak_power_kw, 2)

    worked = [
        worked_calc(
            label="Peak C-rate",
            formula="C_rate = P_peak / E_pack",
            values={
                "P_peak": (peak_power_r, "kW"),
                "E_pack": (battery_kwh, "kWh"),
            },
            result=peak_c_rate_r, result_unit="C",
            assumptions=[
                "peak_power from SOC-step loop (piecewise empirical taper x temperature derate — not hand-checkable)",
                "C-rate = kW / kWh = h^-1",
            ],
        ),
    ]

    return {
        "battery_kwh": battery_kwh,
        "soc_start_pct": soc_start,
        "soc_target_pct": soc_target,
        "chemistry": chemistry,
        "battery_temp_c": temp_c,
        "temperature_derate_factor": round(temp_factor, 3),
        "max_power_kw_input": max_power_kw,
        "peak_power_kw_achieved": peak_power_r,
        "average_power_kw": round(avg_power_kw, 2),
        "peak_c_rate": peak_c_rate_r,
        "total_charge_time_minutes": round(total_time_minutes, 1),
        "total_charge_time_hours": round(total_time_hours, 3),
        "energy_delivered_kwh": round(energy_delivered_kwh, 2),
        # Trimmed for transport efficiency — every 5th SOC sample
        "actual_max_power_per_soc_kw": power_curve[::5] if len(power_curve) > 30 else power_curve,
        "worked": worked,
        "_meta": {
            "model": "Empirical CCS taper curve per chemistry x temperature derating",
            "references": [
                "Argonne National Lab Fast Charging EV test data",
                "Idaho National Lab BatteryPlus",
                "Wassiliadis et al., J Energy Storage 2021",
            ],
        },
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
