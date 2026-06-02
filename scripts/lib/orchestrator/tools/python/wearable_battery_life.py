#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/wearable_battery_life.py

Coin-cell / micro-LiPo battery life calculator for wearable medical
devices (CGM, hearing aids, patches). Reads JSON from stdin, writes
JSON to stdout.

Input:
    {
      "battery_type": "CR2032",          # "CR2032"|"CR2477"|"CR1620"|"LiPo_50mAh"|"LiPo_100mAh"
      "sensor_uA": 5.0,                  # continuous sensor current draw
      "mcu_sleep_uA": 2.0,               # MCU sleep current
      "transmit_burst_mA": 10.0,         # BLE TX burst current
      "transmit_duty_pct": 0.1,          # % of time transmitting (e.g. 0.1 = 0.1%)
      "transmit_burst_ms": 5.0,          # length of each TX burst
      "ambient_temp_c": 25.0
    }

Output:
    {
      "estimated_days": 1100,
      "estimated_years": 3.0,
      "capacity_used_mAh": 220.0,
      "average_current_uA": 12.0,
      ...
    }

Battery capacities from manufacturer datasheets (Energizer, Panasonic,
Renata, Varta) — given at 25°C and a constant low drain. Real CGM
loads (5-15 µA quiescent + 10 mA TX bursts) match the "low drain
intermittent" profile that primary lithium coin cells are rated for.

Coin-cell capacity at low drain (µA range):
- CR2032: 220 mAh
- CR2477: 1000 mAh
- CR1620: 75 mAh
- CR2450: 620 mAh

LiPo capacities are quoted at 0.2C drain; CGM loads are far below,
so effective capacity ≈ rated capacity. Self-discharge ≈ 3%/month.

References:
- Energizer CR2032 datasheet
- Panasonic CR2477 datasheet
- Renata 3V Lithium technical data
- IEC 60086-3 (coin cell test methods)
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
    "tool_name": 'wearable_battery_life (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'Energizer CR2032 Product Datasheet; Panasonic CR-Series Lithium Manganese Datasheets; IEC 60086-3:2021',
    "physics_basis": 'Battery life = capacity / mean current. Mean current = sleep_current + (active_current × duty_cycle).',
    "confidence_class": 'datasheet',
    "last_reviewed_date": "2026-05-22",
}


# Battery type → capacity (mAh) at low-drain intermittent load + nominal V
# + self-discharge per month (%) + temperature coefficient.
BATTERY_PARAMS = {
    "CR2032": {
        "capacity_mAh": 220.0,
        "voltage_v": 3.0,
        "self_discharge_pct_per_month": 0.7,  # ~1% per year
        "temp_capacity_coeff_pct_per_C": -0.5,   # below 25°C: drops, above: small gain
    },
    "CR2477": {
        "capacity_mAh": 1000.0,
        "voltage_v": 3.0,
        "self_discharge_pct_per_month": 0.7,
        "temp_capacity_coeff_pct_per_C": -0.5,
    },
    "CR1620": {
        "capacity_mAh": 75.0,
        "voltage_v": 3.0,
        "self_discharge_pct_per_month": 0.7,
        "temp_capacity_coeff_pct_per_C": -0.5,
    },
    "CR2450": {
        "capacity_mAh": 620.0,
        "voltage_v": 3.0,
        "self_discharge_pct_per_month": 0.7,
        "temp_capacity_coeff_pct_per_C": -0.5,
    },
    "LiPo_50mAh": {
        "capacity_mAh": 50.0,
        "voltage_v": 3.7,
        "self_discharge_pct_per_month": 3.0,
        "temp_capacity_coeff_pct_per_C": -0.3,
    },
    "LiPo_100mAh": {
        "capacity_mAh": 100.0,
        "voltage_v": 3.7,
        "self_discharge_pct_per_month": 3.0,
        "temp_capacity_coeff_pct_per_C": -0.3,
    },
    "LiPo_200mAh": {
        "capacity_mAh": 200.0,
        "voltage_v": 3.7,
        "self_discharge_pct_per_month": 3.0,
        "temp_capacity_coeff_pct_per_C": -0.3,
    },
}


def compute(payload: dict) -> dict:
    battery_type = str(payload.get("battery_type", "CR2032"))
    sensor_uA = float(payload.get("sensor_uA", 5.0))
    mcu_sleep_uA = float(payload.get("mcu_sleep_uA", 2.0))
    tx_burst_mA = float(payload.get("transmit_burst_mA", 10.0))
    tx_duty_pct = float(payload.get("transmit_duty_pct", 0.1))
    tx_burst_ms = float(payload.get("transmit_burst_ms", 5.0))
    ambient_c = float(payload.get("ambient_temp_c", 25.0))

    if battery_type not in BATTERY_PARAMS:
        battery_type = "CR2032"
    bp = BATTERY_PARAMS[battery_type]

    # Effective capacity at ambient temperature (and assuming low drain)
    temp_capacity_factor = max(0.5, 1.0 + bp["temp_capacity_coeff_pct_per_C"] / 100.0
                                       * (ambient_c - 25.0))
    effective_capacity_mAh = bp["capacity_mAh"] * temp_capacity_factor

    # Convert TX burst current to time-averaged contribution
    # avg_tx_uA = tx_burst_mA × 1000 × duty_fraction
    duty_fraction = tx_duty_pct / 100.0
    avg_tx_uA = tx_burst_mA * 1000.0 * duty_fraction

    # Total continuous + averaged-burst current
    total_avg_uA = sensor_uA + mcu_sleep_uA + avg_tx_uA

    # Self-discharge equivalent µA: capacity × monthly% / (730 hours)
    # 730 h ≈ 1 month
    self_discharge_uA = (effective_capacity_mAh * 1000.0 *
                          bp["self_discharge_pct_per_month"] / 100.0) / 730.0

    total_drain_uA = total_avg_uA + self_discharge_uA

    if total_drain_uA <= 0:
        total_drain_uA = 0.01

    # Battery life in hours: capacity (µAh) / drain (µA)
    capacity_uAh = effective_capacity_mAh * 1000.0
    life_hours = capacity_uAh / total_drain_uA
    life_days = life_hours / 24.0
    life_years = life_days / 365.25

    # Peak power check: instantaneous TX power requirement
    instantaneous_power_mW = tx_burst_mA * bp["voltage_v"]
    average_power_mW = (total_avg_uA / 1000.0) * bp["voltage_v"]

    # 14-day CGM lifespan: typical commercial target. Check headroom.
    cgm_lifespan_days = 14.0
    cgm_headroom_pct = ((life_days - cgm_lifespan_days) / cgm_lifespan_days) * 100.0

    # Rounded intermediates for chained worked calculations.
    eff_cap_r = round(effective_capacity_mAh, 3)
    avg_tx_r = round(avg_tx_uA, 4)
    total_avg_r = round(total_avg_uA, 4)
    self_dis_r = round(self_discharge_uA, 4)
    total_drain_r = round(total_drain_uA, 4)
    capacity_uAh_r = round(capacity_uAh, 2)
    life_hours_r = round(life_hours, 2)
    life_days_r = round(life_days, 2)

    worked = [
        worked_calc(
            label="Average TX current contribution",
            formula="avg_tx_uA = tx_burst_mA x 1000 x duty_fraction",
            values={
                "tx_burst_mA": (tx_burst_mA, "mA"),
                "duty_fraction": (duty_fraction, ""),
            },
            result=avg_tx_r, result_unit="uA",
            assumptions=["duty_fraction = transmit_duty_pct / 100; burst current time-averaged over full cycle"],
        ),
        worked_calc(
            label="Total average current (all consumers)",
            formula="total_avg_uA = sensor_uA + mcu_sleep_uA + avg_tx_uA",
            values={
                "sensor_uA": (sensor_uA, "uA"),
                "mcu_sleep_uA": (mcu_sleep_uA, "uA"),
                "avg_tx_uA": (avg_tx_r, "uA"),
            },
            result=total_avg_r, result_unit="uA",
            assumptions=["three independent current sources summed linearly"],
        ),
        worked_calc(
            label="Self-discharge equivalent current",
            formula="self_dis_uA = (eff_cap_mAh x 1000 x self_dis_pct_month / 100) / 730",
            values={
                "eff_cap_mAh": (eff_cap_r, "mAh"),
                "self_dis_pct_month": (bp["self_discharge_pct_per_month"], "%/month"),
            },
            result=self_dis_r, result_unit="uA",
            assumptions=["730 h per month; self-discharge modelled as constant equivalent current drain"],
        ),
        worked_calc(
            label="Total drain current (active + self-discharge)",
            formula="total_drain_uA = total_avg_uA + self_dis_uA",
            values={
                "total_avg_uA": (total_avg_r, "uA"),
                "self_dis_uA": (self_dis_r, "uA"),
            },
            result=total_drain_r, result_unit="uA",
            assumptions=[],
        ),
        worked_calc(
            label="Effective battery capacity in uAh",
            formula="capacity_uAh = eff_cap_mAh x 1000",
            values={"eff_cap_mAh": (eff_cap_r, "mAh")},
            result=capacity_uAh_r, result_unit="uAh",
            assumptions=["1 mAh = 1000 uAh"],
        ),
        worked_calc(
            label="Battery life in hours",
            formula="life_hours = capacity_uAh / total_drain_uA",
            values={
                "capacity_uAh": (capacity_uAh_r, "uAh"),
                "total_drain_uA": (total_drain_r, "uA"),
            },
            result=life_hours_r, result_unit="h",
            assumptions=["constant-drain approximation (Peukert effect negligible at uA range)"],
        ),
        worked_calc(
            label="Battery life in days",
            formula="life_days = life_hours / 24",
            values={"life_hours": (life_hours_r, "h")},
            result=life_days_r, result_unit="days",
            assumptions=[],
        ),
    ]

    return {
        "battery_type": battery_type,
        "battery_voltage_v": bp["voltage_v"],
        "rated_capacity_mAh": bp["capacity_mAh"],
        "effective_capacity_mAh": round(effective_capacity_mAh, 2),
        "temperature_capacity_factor": round(temp_capacity_factor, 4),
        "sensor_current_uA": sensor_uA,
        "mcu_sleep_current_uA": mcu_sleep_uA,
        "tx_burst_current_mA": tx_burst_mA,
        "tx_duty_cycle_pct": tx_duty_pct,
        "tx_avg_contribution_uA": round(avg_tx_uA, 3),
        "self_discharge_equiv_uA": round(self_discharge_uA, 3),
        "total_average_drain_uA": round(total_drain_uA, 3),
        "average_current_uA": round(total_drain_uA, 3),  # alias
        "estimated_hours": round(life_hours, 1),
        "estimated_days": round(life_days, 1),
        "estimated_years": round(life_years, 2),
        "capacity_used_mAh": round(effective_capacity_mAh, 2),
        "average_power_mW": round(average_power_mW, 4),
        "peak_tx_power_mW": round(instantaneous_power_mW, 2),
        "cgm_14day_headroom_pct": round(cgm_headroom_pct, 1),
        "feasibility": (
            "OK" if life_days > cgm_lifespan_days * 1.5 else
            "TIGHT" if life_days > cgm_lifespan_days else
            "INFEASIBLE"
        ),
        "worked": worked,
        "_meta": {
            "model": "Coin-cell low-drain capacity model + duty-cycled BLE TX",
            "references": [
                "Energizer / Panasonic / Renata datasheets",
                "IEC 60086-3",
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
