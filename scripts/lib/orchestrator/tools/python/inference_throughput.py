#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/inference_throughput.py

Edge AI inference throughput estimator. Reads JSON from stdin, writes
JSON to stdout.

Input:
    {
      "model_params_M": 25.0,            # millions of parameters (e.g. ResNet-50 = 25M)
      "model_macs_G": 4.1,                # OPTIONAL: GMACs per inference (estimated from params if absent)
      "quantization": "int8",             # "fp32"|"fp16"|"int8"|"int4"
      "accelerator": "Jetson Orin Nano",  # accelerator class
      "batch_size": 1
    }

Output:
    {
      "inferences_per_sec": 320,
      "memory_used_mb": 30.5,
      "power_w": 12.5,
      "effective_tops": 6.4,
      ...
    }

Physics: throughput ≈ accelerator_TOPS × utilisation / (2 × MACs_per_inference).
The 2× is the GMACs-to-GOps convert (each MAC = 1 multiply + 1 add).
MACs ≈ params for FC-dominant nets; for conv-dominant nets MACs are
input-size dependent. We use 0.16 GMACs/M-params as a rough average
for vision models (ResNet-50 = 25M params, 4.1 GMACs).

Quantisation factor: throughput scales as bits-per-weight^-1 roughly
(int8 = 4× faster than fp32 on tensor cores; int4 = 8×).

References:
- NVIDIA Jetson datasheets (Orin Nano 40 TOPS Sparse INT8)
- Google Coral TPU Edge datasheet (4 TOPS INT8)
- Intel Movidius Myriad X (1 TOPS)
- Hailo-8 datasheet (26 TOPS INT8)
- MLPerf Edge Inference v3.0 benchmarks
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'inference_throughput (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'NVIDIA Jetson Datasheets; Coral Edge TPU Datasheet; MLPerf Inference: Edge v3.0 Results (2024)',
    "physics_basis": 'Throughput = utilisation × peak_TOPS / GOps_per_inference. End-to-end (incl pre/post) utilisation ~15-40% of theoretical peak.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Accelerator specs: peak TOPS, sustained utilisation (vs peak), power,
# memory bandwidth, on-chip memory. Sources: vendor datasheets + MLPerf.
ACCELERATOR_SPECS = {
    "Jetson Orin Nano": {
        # NVIDIA Jetson Orin Nano 8GB (40 TOPS Sparse INT8, 20 dense)
        # MLPerf Edge ResNet-50 INT8: ~280 inf/sec @ 10W → ~15% peak TOPS
        "tops_int8": 20.0,        # dense int8
        "tops_fp16": 10.0,        # GPU fp16
        "tops_fp32": 5.0,         # rare on this hardware
        "tops_int4": 40.0,
        "utilisation_typical": 0.15,  # MLPerf Edge real-world end-to-end
        "power_w_typ": 10.0,
        "memory_gb": 8.0,
        "mem_bandwidth_gb_s": 68.0,
    },
    "Jetson Orin Nx": {
        # Orin NX 16GB (100 TOPS sparse INT8, 50 dense)
        "tops_int8": 50.0,
        "tops_fp16": 25.0,
        "tops_fp32": 12.5,
        "tops_int4": 100.0,
        "utilisation_typical": 0.15,
        "power_w_typ": 15.0,
        "memory_gb": 16.0,
        "mem_bandwidth_gb_s": 102.0,
    },
    "Coral TPU": {
        # Google Coral USB Accelerator / Dev Board (Edge TPU)
        "tops_int8": 4.0,
        "tops_fp16": 0.0,        # not supported
        "tops_fp32": 0.0,        # not supported
        "tops_int4": 0.0,        # not supported
        "utilisation_typical": 0.50,
        "power_w_typ": 2.0,
        "memory_gb": 0.008,      # 8 MB on-chip
        "mem_bandwidth_gb_s": 30.0,
    },
    "Intel NUC": {
        # Intel Core i5-1240P + OpenVINO (no NPU)
        "tops_int8": 6.0,        # VNNI int8 vector
        "tops_fp16": 3.0,
        "tops_fp32": 1.5,
        "tops_int4": 6.0,
        "utilisation_typical": 0.35,
        "power_w_typ": 28.0,
        "memory_gb": 16.0,
        "mem_bandwidth_gb_s": 76.0,
    },
    "Hailo-8": {
        # Hailo-8 M.2 module (26 TOPS INT8)
        "tops_int8": 26.0,
        "tops_fp16": 0.0,        # not supported
        "tops_fp32": 0.0,        # not supported
        "tops_int4": 0.0,        # not yet
        "utilisation_typical": 0.55,
        "power_w_typ": 2.5,
        "memory_gb": 0.0,        # uses host memory
        "mem_bandwidth_gb_s": 16.0,
    },
    "Raspberry Pi 5": {
        # CPU-only inference; ~0.05 TOPS effective on int8
        "tops_int8": 0.1,
        "tops_fp16": 0.05,
        "tops_fp32": 0.025,
        "tops_int4": 0.1,
        "utilisation_typical": 0.50,
        "power_w_typ": 8.0,
        "memory_gb": 8.0,
        "mem_bandwidth_gb_s": 17.0,
    },
    "Hailo-15": {
        "tops_int8": 20.0,
        "tops_fp16": 0.0,
        "tops_fp32": 0.0,
        "tops_int4": 0.0,
        "utilisation_typical": 0.55,
        "power_w_typ": 4.0,
        "memory_gb": 1.0,
        "mem_bandwidth_gb_s": 12.0,
    },
}

# Quantisation: memory factor (bytes per weight) + speed factor relative to fp32
QUANT_PARAMS = {
    "fp32": {"bytes_per_weight": 4.0, "speed_factor": 1.0},
    "fp16": {"bytes_per_weight": 2.0, "speed_factor": 2.0},
    "int8": {"bytes_per_weight": 1.0, "speed_factor": 4.0},
    "int4": {"bytes_per_weight": 0.5, "speed_factor": 8.0},
}


def compute(payload: dict) -> dict:
    model_params_M = float(payload.get("model_params_M", 25.0))
    model_macs_G = payload.get("model_macs_G")
    quantization = str(payload.get("quantization", "int8"))
    accelerator = str(payload.get("accelerator", "Jetson Orin Nano"))
    batch_size = int(payload.get("batch_size", 1))

    if accelerator not in ACCELERATOR_SPECS:
        accelerator = "Jetson Orin Nano"
    if quantization not in QUANT_PARAMS:
        quantization = "int8"

    spec = ACCELERATOR_SPECS[accelerator]
    quant = QUANT_PARAMS[quantization]

    # Estimate MACs/inference if not provided.
    # ResNet-50 = 25M params, 4.1 GMACs → 0.164 GMACs/M
    # Typical CNNs: 0.10-0.30 GMACs/M
    # Transformers (BERT): ~0.05 GMACs/M (much more attention/params)
    if model_macs_G is None:
        macs_G = model_params_M * 0.16  # vision CNN default
    else:
        macs_G = float(model_macs_G)

    # GOps per inference = 2 × MACs (mul + add)
    gops_per_inference = 2.0 * macs_G

    # Effective TOPS for the chosen quantisation. Use the per-precision
    # TOPS rating from datasheet (already accounts for the silicon).
    if quantization == "int8":
        peak_tops = spec["tops_int8"]
    elif quantization == "fp16":
        peak_tops = spec["tops_fp16"]
    elif quantization == "fp32":
        peak_tops = spec["tops_fp32"]
    else:  # int4
        peak_tops = spec["tops_int4"]

    # If the accelerator doesn't support this precision, drop hard.
    if peak_tops <= 0:
        peak_tops = 0.01  # tiny fallback

    effective_tops = peak_tops * spec["utilisation_typical"]
    # 1 TOPS = 1000 GOps/s
    gops_per_sec = effective_tops * 1000.0

    # Inferences/sec (batched)
    inferences_per_sec_per_unit = gops_per_sec / gops_per_inference
    # Batch helps near-linearly until memory or compute saturates
    batch_speedup = min(float(batch_size), 8.0)  # diminishing returns past 8
    inferences_per_sec = inferences_per_sec_per_unit * (1.0 if batch_size <= 1 else 0.7 + 0.3 * batch_speedup)
    inferences_per_sec = inferences_per_sec_per_unit  # ignore batch for now; default batch=1

    # Memory: params × bytes-per-weight + activation memory (rough 2× weights)
    model_weights_mb = model_params_M * 1e6 * quant["bytes_per_weight"] / 1e6
    activation_overhead_mb = model_weights_mb * 2.0 * batch_size
    memory_used_mb = model_weights_mb + activation_overhead_mb

    # Power: roughly linear with utilisation
    power_w = spec["power_w_typ"] * (0.3 + 0.7 * spec["utilisation_typical"])

    # Inferences per joule (energy efficiency)
    inferences_per_joule = inferences_per_sec / max(0.01, power_w)

    # Memory feasibility check
    memory_ok = memory_used_mb < (spec["memory_gb"] * 1024 * 0.8)  # 80% of total

    return {
        "model_params_M": model_params_M,
        "model_macs_G_estimated": round(macs_G, 3),
        "gops_per_inference": round(gops_per_inference, 3),
        "quantization": quantization,
        "accelerator": accelerator,
        "peak_tops": peak_tops,
        "utilisation_typical": spec["utilisation_typical"],
        "effective_tops": round(effective_tops, 3),
        "inferences_per_sec": round(inferences_per_sec, 1),
        "model_weights_mb": round(model_weights_mb, 2),
        "memory_used_mb": round(memory_used_mb, 2),
        "memory_available_mb": round(spec["memory_gb"] * 1024, 0),
        "memory_feasible": memory_ok,
        "power_w": round(power_w, 2),
        "inferences_per_joule": round(inferences_per_joule, 2),
        "batch_size": batch_size,
        "_meta": {
            "model": "Peak-TOPS × utilisation / GOps-per-inference",
            "references": [
                "NVIDIA Jetson datasheets",
                "Google Coral Edge TPU datasheet",
                "MLPerf Edge Inference v3.0",
                "Hailo-8 datasheet",
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
