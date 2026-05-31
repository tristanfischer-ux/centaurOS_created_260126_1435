#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_remaining_class_tools.py

Standalone smoke tests for the class-plan engineering tools used by
CGM (continuous glucose monitor), edge AI inference box, and EV fast
charger product classes.

Each @case runs a known-input calculation and PASS/FAIL based on a
documented expected range from textbook / industry data.

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_remaining_class_tools.py

Sister files:
    test_class_plan_tools.py   — HAPS / VF / Heat Pump / AUV / Drone / Bioreactor
    test_all_tools.py          — older BESS / cleantech tools
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
PYTHON = str(HERE.parents[4] / ".venv" / "bin" / "python3")

RESULTS: list[dict[str, Any]] = []


def case(name: str, expected: str, tool_kind: str = "custom"):
    """Decorator that wraps a test with PASS/FAIL + timing."""
    def wrap(fn):
        def runner():
            t0 = time.time()
            entry: dict[str, Any] = {"tool": name, "expected": expected, "kind": tool_kind}
            try:
                value = fn()
                entry["status"] = "PASS"
                entry["value"] = value
            except AssertionError as exc:
                entry["status"] = "FAIL"
                entry["error_type"] = "AssertionError"
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            except Exception as exc:
                entry["status"] = "ERROR"
                entry["error_type"] = type(exc).__name__
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            entry["wall_time_s"] = round(time.time() - t0, 3)
            RESULTS.append(entry)
        return runner
    return wrap


def run_wrapper(script_name: str, payload: dict) -> dict:
    """Run a stdin/stdout JSON wrapper script. Returns parsed output."""
    path = HERE / script_name
    proc = subprocess.run(
        [PYTHON, str(path)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"{script_name} exit {proc.returncode}: stderr={proc.stderr[:300]} stdout={proc.stdout[:200]}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{script_name} returned non-JSON: {proc.stdout[:200]} (err={exc})")


# ============================================================================
# CGM (Continuous Glucose Monitor) tools
# ============================================================================

@case("glucose_sensor",
      "GOx, 100 mg/dL, 600 mV, 5 mm² electrode: i ≈ 1-15 nA (Dexcom G6 datasheet ~5-30 nA)",
      "custom")
def t_glucose_sensor():
    result = run_wrapper("glucose_sensor.py", {
        "glucose_mg_dl": 100.0,
        "enzyme_type": "GOx",
        "bias_voltage_mv": 600.0,
        "electrode_area_mm2": 5.0,
        "temperature_c": 32.0,
    })
    current_na = result["current_total_nA"]
    sensitivity = result["current_density_nA_per_mM"]
    # Dexcom G6 datasheet: ~5 nA at 100 mg/dL (5.55 mM glucose)
    # Sensitivity ~1-3 nA/mM
    assert 1.0 < current_na < 50.0, f"current out of range: {current_na} nA"
    assert 0.3 < sensitivity < 10.0, f"sensitivity out of range: {sensitivity} nA/mM"
    return f"i={current_na} nA, sensitivity={sensitivity} nA/mM, t_resp={result['response_time_s']}s"


@case("wireless_link_budget",
      "BLE 2.4 GHz, 0 dBm TX, 2m on-body: link margin > 20 dB",
      "custom")
def t_wireless_link():
    result = run_wrapper("wireless_link_budget.py", {
        "tx_power_dbm": 0.0,
        "frequency_ghz": 2.4,
        "distance_m": 2.0,
        "body_absorption": True,
        "antenna_gain_tx_dbi": 0.0,
        "antenna_gain_rx_dbi": 2.0,
        "rx_sensitivity_dbm": -90.0,
    })
    margin = result["link_margin_db"]
    fspl = result["free_space_path_loss_db"]
    rx_p = result["rx_power_dbm"]
    # Friis at 2.4 GHz, 2m: 4πd/λ = 4π × 2 / 0.125 = 201, log10 × 20 = 46 dB
    # 0 dBm + 0 + 2 - 46 - 3 (body) = -47 dBm rx
    # Margin = -47 - (-90) = 43 dB
    assert margin > 20.0, f"link margin too low: {margin} dB"
    assert 44 < fspl < 50, f"FSPL wrong: {fspl} dB"
    return f"margin={margin} dB, rx={rx_p} dBm, max_range={result['max_range_m']} m"


@case("wearable_battery_life",
      "CR2032 (220 mAh) + 5 µA sleep + 10 mA TX @ 0.1% duty: ~1-2 years",
      "custom")
def t_wearable_battery():
    # Real-world physics: 5 µA + 10 mA × 0.001 = 15 µA mean
    # 220 mAh / 15 µA = 14,666 hours = 611 days = 1.67 years
    # (Spec said 3-5 years but its own numbers give 1.5-2 years —
    # adjusting test to match physics, not the spec's expectation.)
    result = run_wrapper("wearable_battery_life.py", {
        "battery_type": "CR2032",
        "sensor_uA": 5.0,
        "mcu_sleep_uA": 0.0,
        "transmit_burst_mA": 10.0,
        "transmit_duty_pct": 0.1,
        "transmit_burst_ms": 5.0,
        "ambient_temp_c": 25.0,
    })
    years = result["estimated_years"]
    days = result["estimated_days"]
    avg_uA = result["average_current_uA"]
    assert 0.5 < years < 3.0, f"battery life out of range: {years} years"
    assert 10 < avg_uA < 20, f"avg current out of range: {avg_uA} uA"
    assert days > 14.0, f"CGM 14-day target not met: {days} days"
    return f"life={years} years, avg={avg_uA} µA, headroom_vs_14d={result['cgm_14day_headroom_pct']}%"


@case("biocompatibility_check",
      "['Pt', 'PDMS'] subcutaneous prolonged: PASS, ISO 10993-1/5/6/10/11/23",
      "custom")
def t_biocompatibility():
    result = run_wrapper("biocompatibility_check.py", {
        "materials": ["Pt", "PDMS"],
        "contact_type": "subcutaneous",
        "contact_duration": "prolonged",
    })
    overall = result["overall_pass"]
    parts = result["required_iso10993_parts"]
    n_passive = sum(1 for m in result["per_material"] if m["iso10993_grade"] == "passive")
    assert overall is True, f"overall_pass not True: {overall}"
    assert "1" in parts and "5" in parts and "6" in parts, f"missing required parts: {parts}"
    assert n_passive == 2, f"both Pt and PDMS should be passive: {n_passive}"
    return f"PASS, {n_passive}/2 passive, parts={parts}"


# ============================================================================
# Edge AI Inference Box tools
# ============================================================================

@case("inference_throughput",
      "ResNet-50 INT8 (25M params) on Jetson Orin Nano: 200-500 inf/sec (MLPerf Edge)",
      "custom")
def t_inference_throughput():
    result = run_wrapper("inference_throughput.py", {
        "model_params_M": 25.0,
        "quantization": "int8",
        "accelerator": "Jetson Orin Nano",
        "batch_size": 1,
    })
    inf_per_sec = result["inferences_per_sec"]
    power_w = result["power_w"]
    mem_mb = result["memory_used_mb"]
    # MLPerf Edge ResNet-50 INT8 Orin Nano: ~250-400 inf/s
    assert 200 < inf_per_sec < 600, f"throughput out of range: {inf_per_sec} inf/s"
    assert 3 < power_w < 20, f"power out of range: {power_w} W"
    return f"{inf_per_sec} inf/s, {power_w} W, mem={mem_mb} MB"


@case("thermal_envelope",
      "15 W TDP, 25°C ambient, 100mm passive heatsink, vented box: Tj ≈ 60-75°C, safe",
      "custom")
def t_thermal_envelope():
    result = run_wrapper("thermal_envelope.py", {
        "tdp_w": 15.0,
        "ambient_c": 25.0,
        "heatsink_type": "passive_finned",
        "enclosure": "vented_box",
        "max_junction_c": 95.0,
    })
    tj = result["junction_temp_c"]
    risk = result["throttle_risk"]
    margin = result["junction_margin_c"]
    assert 55 < tj < 80, f"junction temp out of range: {tj}°C"
    assert risk == "safe", f"risk should be safe: {risk}"
    assert margin > 15, f"junction margin too low: {margin}°C"
    return f"Tj={tj}°C, risk={risk}, margin={margin}°C"


@case("network_bandwidth",
      "100 inf/sec × 1 kB output, 4G uplink: <1 Mbps, OK",
      "custom")
def t_network_bandwidth():
    # 100 inf/s × 1 kB × 8 bits = 800 kbps = 0.8 Mbps. With redundancy 1.2 → 0.96 Mbps.
    # 4G uplink typical 25 Mbps so utilisation < 5% → OK
    result = run_wrapper("network_bandwidth.py", {
        "inferences_per_sec": 100,
        "output_kbytes_per_inference": 1.0,
        "link_type": "4G",
        "latency_budget_ms": 500,
    })
    bw = result["required_bandwidth_mbps"]
    feas = result["link_feasibility"]
    gb_mo = result["monthly_data_gb"]
    assert bw < 1.5, f"bandwidth too high: {bw} Mbps"
    assert feas == "OK", f"feasibility not OK: {feas}"
    return f"BW={bw} Mbps, feas={feas}, gb/mo={gb_mo}, latency_ok={result['latency_feasible']}"


@case("enclosure_emc",
      "Die-cast aluminium 40 dB shielding, CISPR-22 Class B @ 100 MHz: margin > 10 dB",
      "custom")
def t_enclosure_emc():
    result = run_wrapper("enclosure_emc.py", {
        "enclosure_material": "die_cast_alu",
        "shielding_dB": 40.0,
        "target_standard": "CISPR_22_B",
        "source_dBuV_m_at_3m": 60.0,
        "frequency_mhz": 100.0,
    })
    margin = result["compliance_margin_dB"]
    predicted = result["predicted_emissions_dBuV_m"]
    passes = result["compliance_pass"]
    assert margin > 10.0, f"compliance margin too low: {margin} dB"
    assert passes is True, f"compliance not passing: {passes}"
    return f"margin={margin} dB, predicted={predicted} dBuV/m, pass={passes}"


# ============================================================================
# EV Fast Charger tools
# ============================================================================

@case("ev_battery_charging_curve",
      "60 kWh NMC, 20%→80% SOC, 150 kW max, 25°C: total ~28-36 min",
      "custom")
def t_ev_charging_curve():
    result = run_wrapper("ev_battery_charging_curve.py", {
        "battery_kwh": 60.0,
        "soc_start_pct": 20.0,
        "soc_target_pct": 80.0,
        "max_power_kw": 150.0,
        "battery_chemistry": "NMC",
        "battery_temp_c": 25.0,
    })
    minutes = result["total_charge_time_minutes"]
    peak = result["peak_power_kw_achieved"]
    energy = result["energy_delivered_kwh"]
    c_rate = result["peak_c_rate"]
    assert 25 < minutes < 40, f"charge time out of range: {minutes} min"
    assert 100 < peak <= 150, f"peak power out of range: {peak} kW"
    assert 35 < energy < 37, f"energy delivered wrong: {energy} kWh"
    assert c_rate < 3.0, f"c-rate too high: {c_rate}"
    return f"t={minutes} min, peak={peak} kW, energy={energy} kWh, c={c_rate}"


@case("ccs_protocol_compliance",
      "1000V, 500A, ISO 15118-20, CCS2: pass=True, V2G=True, 500 kW",
      "custom")
def t_ccs_compliance():
    result = run_wrapper("ccs_protocol_compliance.py", {
        "max_voltage_v": 1000.0,
        "max_current_a": 500.0,
        "protocol_version": "ISO_15118_20",
        "plug_type": "CCS2",
    })
    passes = result["compliance_pass"]
    v2g = result["V2G_capable"]
    kw = result["max_power_supported_kw"]
    pnc = result["PnC_supported"]
    assert passes is True, f"compliance failed: {result['issues']}"
    assert v2g is True, f"V2G should be True: {v2g}"
    assert pnc is True, f"PnC should be True: {pnc}"
    assert 450 < kw < 550, f"max kW wrong: {kw}"
    return f"pass={passes}, V2G={v2g}, PnC={pnc}, max_kw={kw}"


@case("power_module_sizing",
      "150 kW total, 25 kW modules, N+1: 7 modules (6 required + 1 redundant)",
      "custom")
def t_power_module_sizing():
    result = run_wrapper("power_module_sizing.py", {
        "total_power_kw": 150.0,
        "module_unit_kw": 25.0,
        "redundancy_n_plus": "N+1",
    })
    n_required = result["module_count_required"]
    n_total = result["module_count_with_redundancy"]
    rated = result["rated_output_kw"]
    eff_partial = result["efficiency_at_partial_load_pct"]
    assert n_required == 6, f"n_required should be 6: {n_required}"
    assert n_total == 7, f"n_total should be 7 (6+1): {n_total}"
    assert 170 < rated < 180, f"rated wrong: {rated} kW"
    assert 90 < eff_partial < 97, f"efficiency wrong: {eff_partial}%"
    return f"modules={n_total} (6+1), rated={rated} kW, eff={eff_partial}%"


@case("cable_thermal",
      "500 A continuous, 5 m cable, liquid-cooled, 40°C ambient: ~70 mm² + lpm cooling",
      "custom")
def t_cable_thermal():
    result = run_wrapper("cable_thermal.py", {
        "continuous_current_a": 500.0,
        "cable_length_m": 5.0,
        "cooling": "liquid_cooled",
        "ambient_c": 40.0,
        "conductor_material": "Cu",
    })
    csa = result["cable_csa_mm2_required"]
    rise = result["cable_temp_rise_c"]
    lpm = result["liquid_cooling_required_lpm"]
    vdrop = result["voltage_drop_v"]
    # Tesla V3 / Heliox 500 A HPC cables: 70-95 mm² with liquid cooling
    assert 50 < csa < 120, f"CSA out of range: {csa} mm²"
    assert lpm > 0.3, f"liquid cooling required: {lpm} lpm"
    assert rise < 50, f"temperature rise too high: {rise}°C"
    return f"CSA={csa} mm², rise={rise}°C, lpm={lpm}, V_drop={vdrop} V"


# ============================================================================
# Main
# ============================================================================

ALL_TESTS = [
    # CGM
    t_glucose_sensor,
    t_wireless_link,
    t_wearable_battery,
    t_biocompatibility,
    # edge_ai
    t_inference_throughput,
    t_thermal_envelope,
    t_network_bandwidth,
    t_enclosure_emc,
    # ev_charger
    t_ev_charging_curve,
    t_ccs_compliance,
    t_power_module_sizing,
    t_cable_thermal,
]


if __name__ == "__main__":
    for fn in ALL_TESTS:
        try:
            fn()
        except Exception as exc:
            RESULTS.append({
                "tool": fn.__name__,
                "status": "HARNESS_ERROR",
                "error_msg": str(exc),
                "wall_time_s": 0.0,
            })

    pass_count = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)

    print("=" * 76)
    print(f"REMAINING CLASS-PLAN TOOL SMOKE TESTS  -  {pass_count}/{total} PASS")
    print("CGM (4)  +  edge_ai (4)  +  ev_charger (4)  =  12 tools")
    print("=" * 76)
    for r in RESULTS:
        s = r["status"]
        sigil = "v" if s == "PASS" else "X"
        print(f"\n[{sigil} {s}] {r['tool']}  ({r['wall_time_s']}s)")
        print(f"    Expected: {r.get('expected', 'n/a')}")
        if s == "PASS":
            print(f"    Result:   {r['value']}")
        else:
            print(f"    Error:    {r.get('error_type', '?')}: {r.get('error_msg', '?')}")
    print()
    sys.exit(0 if pass_count == total else 1)
