#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/onboard_ai_inference.py

On-orbit machine-learning inference compute sizing.
Models accelerator throughput, power, latency, and model fit for typical
spaceborne ML workloads (Movidius Myriad X, Jetson, Coral, Hailo, FPGAs).

Companies served: Ubotica (IE), Unibap (SE), KP Labs (PL), Tellus (NL),
Spire / Iceye onboard ML.

Input:
    {
      "model_size_M_params": 25.0,
      "image_resolution_mp": 12.0,
      "target_inferences_per_second": 5.0,
      "accelerator": "Movidius_Myriad_X" | "Jetson_Xavier_NX" | "Coral_TPU" | "Hailo_8" | "Xilinx_ZU3",
      "quantization": "FP32" | "FP16" | "INT8" | "INT4",
      "input_channels": 4
    }

Output:
    power_w, throughput_fps, model_quantization_required, memory_mb,
    latency_ms_per_inference, _provenance.

Physics:
  Throughput (FPS) = peak_TOPS / model_GOps_per_inference / utilisation
  Power model: P = P_idle + (P_max - P_idle) * (utilisation/100)
  Model memory: params * bytes_per_param + activation_memory

References:
- MLPerf Inference Edge v3.0 reference implementations (mlcommons.org).
- Lin, T.-Y. et al., "Microsoft COCO: Common Objects in Context", arxiv:1405.0312.
- Han, S. et al., "Deep Compression: Compressing Deep Neural Network with
  Pruning, Trained Quantization and Huffman Coding", ICLR 2016 arxiv:1510.00149.
- ESA OPS-SAT mission inflight ML demonstrations (Marin et al. 2021).
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


PROVENANCE = {
    "tool_name": "onboard_ai_inference (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "MLPerf Inference Edge v3.0 reference implementations (MLCommons); "
        "Han et al. (2016) ICLR 'Deep Compression' arxiv:1510.00149; "
        "Marin et al. (2021) IEEE Aerospace Conf. — OPS-SAT in-flight ML."
    ),
    "physics_basis": (
        "Accelerator peak TOPS at advertised utilisation factor (15% for "
        "edge inference per MLPerf). Memory = params * bytes/param + "
        "activations. Power scales with utilisation."
    ),
    "confidence_class": "datasheet",
    "embedded_constants": {
        "ACCELERATOR_SPECS": {
            "source": "Intel Movidius Myriad X / NVIDIA Jetson / Google Coral / Hailo-8 / Xilinx ZU3 datasheets (2021-2024)",
            "confidence": "datasheet",
        },
        "MLPERF_UTILISATION_FACTOR": {
            "source": "MLCommons MLPerf Inference Edge v3.0 — typical real-world utilisation ~15% of peak (end-to-end with pre/post)",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Accelerator specs: peak TOPS at INT8, power max (W), power idle (W),
# memory MB available, dollar cost
ACCELERATORS = {
    "Movidius_Myriad_X":   {"int8_tops": 1.0, "fp16_tops": 0.5, "p_max_w": 2.5, "p_idle_w": 0.5,
                            "memory_mb": 512, "rad_tolerance_krad": 10, "cost_usd": 50},
    "Jetson_Xavier_NX":    {"int8_tops": 21.0, "fp16_tops": 6.0, "p_max_w": 15.0, "p_idle_w": 5.0,
                            "memory_mb": 8192, "rad_tolerance_krad": 5, "cost_usd": 400},
    "Jetson_Orin_Nano":    {"int8_tops": 40.0, "fp16_tops": 20.0, "p_max_w": 15.0, "p_idle_w": 4.0,
                            "memory_mb": 8192, "rad_tolerance_krad": 5, "cost_usd": 500},
    "Coral_TPU":           {"int8_tops": 4.0, "fp16_tops": 0.0, "p_max_w": 2.0, "p_idle_w": 0.5,
                            "memory_mb": 8, "rad_tolerance_krad": 5, "cost_usd": 75},
    "Hailo_8":             {"int8_tops": 26.0, "fp16_tops": 0.0, "p_max_w": 2.5, "p_idle_w": 0.5,
                            "memory_mb": 40, "rad_tolerance_krad": 5, "cost_usd": 250},
    "Xilinx_ZU3":          {"int8_tops": 4.0, "fp16_tops": 2.0, "p_max_w": 8.0, "p_idle_w": 2.0,
                            "memory_mb": 4096, "rad_tolerance_krad": 30, "cost_usd": 1000},
    "Cobham_LEON3":        {"int8_tops": 0.001, "fp16_tops": 0.001, "p_max_w": 1.0, "p_idle_w": 0.3,
                            "memory_mb": 64, "rad_tolerance_krad": 300, "cost_usd": 3000},
}

# Bytes per parameter by quantization
BYTES_PER_PARAM = {"FP32": 4, "FP16": 2, "INT8": 1, "INT4": 0.5}


def compute(payload: dict) -> dict:
    model_M_params = float(payload.get("model_size_M_params", 25.0))
    img_mp = float(payload.get("image_resolution_mp", 12.0))
    target_fps = float(payload.get("target_inferences_per_second", 5.0))
    accel = str(payload.get("accelerator", "Movidius_Myriad_X"))
    quantization = str(payload.get("quantization", "INT8"))
    input_channels = int(payload.get("input_channels", 4))

    if accel not in ACCELERATORS:
        raise ValueError(f"unknown accelerator {accel!r}; known: {list(ACCELERATORS)}")
    a = ACCELERATORS[accel]
    if quantization not in BYTES_PER_PARAM:
        raise ValueError(f"unknown quantization {quantization!r}; known: {list(BYTES_PER_PARAM)}")

    # Peak TOPS at the requested precision
    if quantization in ("INT8", "INT4"):
        peak_tops = a["int8_tops"]
    elif quantization == "FP16":
        peak_tops = a["fp16_tops"] if a["fp16_tops"] > 0 else a["int8_tops"] * 0.5
    else:  # FP32
        peak_tops = a["fp16_tops"] / 2 if a["fp16_tops"] > 0 else a["int8_tops"] * 0.25

    # GOps per inference (approximate: 2 * params * resolution_fraction)
    # For a CNN: total FLOPs ~ 2 * params * (image_pixels * channels / 224^2)
    base_resolution_mp = 224 * 224 / 1e6
    scale_factor = (img_mp * input_channels) / (base_resolution_mp * 3)
    gops_per_inference = 2 * model_M_params * 1e3 * scale_factor / 1000  # GOps

    # Practical utilisation (MLPerf real-world fraction)
    utilisation = 0.15  # 15% — accounts for memory/scheduling overhead
    # For high-quantization, lower utilisation
    if quantization == "INT4":
        utilisation = 0.10

    # Throughput
    effective_tops = peak_tops * utilisation
    throughput_fps = (effective_tops * 1e3) / max(gops_per_inference, 0.001)

    # Power
    util_ratio = min(1.0, target_fps / max(throughput_fps, 0.001))
    p_w = a["p_idle_w"] + (a["p_max_w"] - a["p_idle_w"]) * util_ratio

    # Memory requirement
    bytes_per_p = BYTES_PER_PARAM[quantization]
    model_mb = model_M_params * 1e6 * bytes_per_p / 1e6  # MB
    # Activations: ~2x model size (conservative)
    activation_mb = model_mb * 2.0
    total_memory_mb = model_mb + activation_mb

    # Fit check
    fits_in_memory = total_memory_mb <= a["memory_mb"]
    quantization_required = quantization
    if not fits_in_memory and quantization == "FP32":
        quantization_required = "INT8"
    elif not fits_in_memory and quantization == "FP16":
        quantization_required = "INT8"

    # Latency
    latency_ms = 1000.0 / max(throughput_fps, 0.001)

    # Throughput target met?
    target_met = throughput_fps >= target_fps

    # Worked calculations — only clean closed-form arithmetic steps are shown.
    # scale_factor, effective_tops, throughput_fps chain off each other.
    # util_ratio uses min() so is skipped; power uses util_ratio so is skipped.
    scale_factor_r = round(scale_factor, 4)
    gops_r = round(gops_per_inference, 1)
    eff_tops_r = round(effective_tops, 4)
    # Use 4dp so the substituted arithmetic (eff_tops_r * 1000 / gops_r) reproduces the stated result.
    # round(throughput_fps, 2) can mask a factor-1000 gap when the true value is ~0.009 (rounds to 0.01).
    thr_r = round(throughput_fps, 4)
    model_mb_r = round(model_mb, 1)
    worked = [
        worked_calc(
            label="Resolution scale factor (image vs 224x224 baseline)",
            formula="scale_factor = (img_mp x input_channels) / (base_resolution_mp x 3)",
            values={
                "img_mp": (img_mp, "Mpix"),
                "input_channels": (input_channels, "ch"),
                "base_resolution_mp": (round(base_resolution_mp, 5), "Mpix"),
            },
            result=scale_factor_r, result_unit="",
            assumptions=["baseline CNN input 224x224 px (3 channels); COCO reference — Lin et al. 2015"],
        ),
        worked_calc(
            label="GOps per inference",
            formula="gops_per_inference = 2 x model_M_params x 1000 x scale_factor / 1000",
            values={
                "model_M_params": (model_M_params, "M"),
                "scale_factor": (scale_factor_r, ""),
            },
            result=gops_r, result_unit="GOps",
            assumptions=["2x multiply-accumulate per parameter; image-resolution scaling only"],
        ),
        worked_calc(
            label="Effective (practical) TOPS",
            formula="effective_tops = peak_tops x utilisation",
            values={
                "peak_tops": (peak_tops, "TOPS"),
                "utilisation": (utilisation, ""),
            },
            result=eff_tops_r, result_unit="TOPS",
            assumptions=["15% real-world utilisation from MLPerf Inference Edge v3.0"],
        ),
        worked_calc(
            label="Accelerator throughput",
            formula="throughput_fps = (effective_tops x 1000) / gops_per_inference",
            values={
                "effective_tops": (eff_tops_r, "TOPS"),
                "gops_per_inference": (gops_r, "GOps"),
            },
            result=thr_r, result_unit="FPS",
            assumptions=["1 TOPS = 1000 GOps/s"],
        ),
        worked_calc(
            label="Model memory footprint",
            formula="model_mb = model_M_params x 1000000 x bytes_per_p / 1000000",
            values={
                "model_M_params": (model_M_params, "M"),
                "bytes_per_p": (bytes_per_p, "B/param"),
            },
            result=model_mb_r, result_unit="MB",
            assumptions=[f"quantization {quantization}; bytes/param from Han et al. (2016)"],
        ),
        worked_calc(
            label="Total memory (model + activations)",
            formula="memory_mb_total = model_mb + activation_mb",
            values={
                "model_mb": (model_mb_r, "MB"),
                "activation_mb": (round(activation_mb, 1), "MB"),
            },
            result=round(total_memory_mb, 1), result_unit="MB",
            assumptions=["activation memory ~ 2x model size (conservative estimate)"],
        ),
    ]

    return {
        "accelerator": accel,
        "model_size_M_params": model_M_params,
        "image_resolution_mp": img_mp,
        "input_channels": input_channels,
        "target_inferences_per_second": target_fps,
        "quantization": quantization,
        "peak_tops_at_quantization": round(peak_tops, 2),
        "gops_per_inference": round(gops_per_inference, 1),
        "throughput_fps": thr_r,
        "target_met": target_met,
        "latency_ms_per_inference": round(latency_ms, 1),
        "power_w": round(p_w, 2),
        "memory_mb_model": round(model_mb, 1),
        "memory_mb_activation": round(activation_mb, 1),
        "memory_mb_total": round(total_memory_mb, 1),
        "memory_available_mb": a["memory_mb"],
        "fits_in_memory": fits_in_memory,
        "quantization_required": quantization_required,
        "utilisation_factor_used": utilisation,
        "rad_tolerance_krad": a["rad_tolerance_krad"],
        "accelerator_cost_usd": a["cost_usd"],
        "worked": worked,
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
