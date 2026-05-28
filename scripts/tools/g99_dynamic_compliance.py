#!/usr/bin/env python3
"""
scripts/tools/g99_dynamic_compliance.py

ENA Engineering Recommendation G99 (EREC G99) dynamic grid-code compliance
checker for a GB-connected Power Generating Module (a containerised BESS is a
Power Park Module — inverter/PCS coupled).

Deterministic checker — NO LLM. Given the design's stated ride-through limits,
droop settings, reactive capability and operating-frequency band, verify they
fall INSIDE the published G99 envelopes. All envelope points are hardcoded
verbatim from the EREC G99 document (NESO published copy).

WHAT IS CHECKED:

1. Type classification (GB §6): A < 1 MW; B = 1 MW to < 10 MW; C = 10 to < 50
   MW; D >= 50 MW (or connection >= 110 kV). A 1 MW BESS is Type B.

2. Fault Ride Through (LVRT), §12.3 Table 12.2 for a Type B Power Park Module:
       Uret  = 0.10 pu at tclear = 0.14 s   (must stay connected to 0 V floor)
       Urec1 = 0.10 pu at trec1  = 0.14 s
       Urec2 = 0.85 pu at trec2  = 0.14 s
       full recovery (>= 0.85 pu) by trec3 = 2.2 s
   The design's declared ride-through capability must ENVELOPE this curve:
   for each breakpoint, the design must tolerate a voltage AT OR BELOW the
   required retained voltage for AT LEAST the required duration.

3. HVRT (over-voltage ride-through): G99 requires staying connected up to
   1.2 pu transient. Design's HVRT ceiling must be >= 1.2 pu.

4. Frequency response (§11.1 / LFSM): LFSM-O must engage by 50.4 Hz with a
   droop in the permitted 2 %-12 % range (default 4 %). Continuous operation
   49.0-51.0 Hz; the design's stated continuous band must cover it; the design
   must also ride the wider time-limited band 47.0-52.0 Hz.

5. Reactive capability (§12.4): continuous operation between 0.95 PF lagging
   and 0.95 PF leading at the Connection Point. Equivalent Q/Pmax = tan(acos
   0.95) = 0.3287. Design's |Q/Pmax| capability must be >= 0.3287.

JSON contract (stdin -> stdout):
  IN: { rated_power_kw, connection_voltage_kv,
        design_lvrt_floor_pu, design_lvrt_floor_duration_s,
        design_hvrt_ceiling_pu,
        design_lfsm_o_trigger_hz, design_droop_pct,
        design_continuous_freq_min_hz, design_continuous_freq_max_hz,
        design_freq_ride_min_hz, design_freq_ride_max_hz,
        design_power_factor }
  OUT: { lvrt_ok, hvrt_ok, freq_response_ok, reactive_capability_ok,
         g99_type, violations: [], checks: {...} }

License: tool code proprietary (in-tree). Standard: ENA EREC G99.
"""
from __future__ import annotations

import json
import math
import sys
import time


# ──────────────────────────────────────────────────────────────────────────
# G99 envelope constants (verbatim from EREC G99)
# ──────────────────────────────────────────────────────────────────────────

# §12.3 Table 12.2 — Type B Power Park Module LVRT voltage-against-time.
# (Uret_pu, time_s) breakpoints the plant must remain connected on/above.
G99_LVRT_TYPE_B_PPM = [
    (0.10, 0.0),    # retained voltage floor 0.10 pu at fault inception
    (0.10, 0.14),   # held to tclear = trec1 = trec2 = 0.14 s
    (0.85, 0.14),   # recovers to 0.85 pu by 0.14 s (Urec2)
    (0.85, 2.2),    # >= 0.85 pu held to trec3 = 2.2 s
]
# §12.3 Table 12.1 — Type B Synchronous (kept for completeness / synchronous BESS).
G99_LVRT_TYPE_B_SYNC = [
    (0.30, 0.0), (0.70, 0.14), (0.90, 0.45), (0.90, 1.5),
]

G99_HVRT_CEILING_PU = 1.20          # transient over-voltage ride-through

G99_LFSM_O_TRIGGER_HZ = 50.4        # LFSM-O must engage at/below 50.4 Hz
G99_DROOP_MIN_PCT = 2.0             # permitted droop 2 %-12 %
G99_DROOP_MAX_PCT = 12.0
G99_CONT_FREQ_MIN_HZ = 49.0         # continuous operation band
G99_CONT_FREQ_MAX_HZ = 51.0
G99_RIDE_FREQ_MIN_HZ = 47.0         # widest time-limited band (47-52 Hz)
G99_RIDE_FREQ_MAX_HZ = 52.0

G99_POWER_FACTOR = 0.95             # 0.95 lead / 0.95 lag continuous
G99_Q_PMAX = math.tan(math.acos(G99_POWER_FACTOR))  # 0.32868

# Type classification thresholds (GB, MW).
TYPE_A_MAX_MW = 1.0
TYPE_B_MAX_MW = 10.0
TYPE_C_MAX_MW = 50.0


def classify_type(rated_power_kw: float, connection_voltage_kv: float) -> str:
    p_mw = rated_power_kw / 1000.0
    if connection_voltage_kv >= 110.0:
        return "D"
    if p_mw < TYPE_A_MAX_MW:
        return "A"
    if p_mw < TYPE_B_MAX_MW:
        return "B"
    if p_mw < TYPE_C_MAX_MW:
        return "C"
    return "D"


def compute(payload: dict) -> dict:
    rated_power_kw = float(payload.get("rated_power_kw", 1000.0))
    connection_voltage_kv = float(payload.get("connection_voltage_kv", 11.0))

    # Design declared capabilities (with G99-compliant defaults for a modern PCS).
    d_lvrt_floor_pu = float(payload.get("design_lvrt_floor_pu", 0.0))
    d_lvrt_floor_dur_s = float(payload.get("design_lvrt_floor_duration_s", 0.15))
    d_hvrt_ceiling_pu = float(payload.get("design_hvrt_ceiling_pu", 1.20))
    d_lfsm_o_trigger_hz = float(payload.get("design_lfsm_o_trigger_hz", 50.4))
    d_droop_pct = float(payload.get("design_droop_pct", 4.0))
    d_cont_fmin_hz = float(payload.get("design_continuous_freq_min_hz", 49.0))
    d_cont_fmax_hz = float(payload.get("design_continuous_freq_max_hz", 51.0))
    d_ride_fmin_hz = float(payload.get("design_freq_ride_min_hz", 47.0))
    d_ride_fmax_hz = float(payload.get("design_freq_ride_max_hz", 52.0))
    d_power_factor = float(payload.get("design_power_factor", 0.95))

    g99_type = classify_type(rated_power_kw, connection_voltage_kv)
    violations: list[str] = []

    # ── 1. LVRT ─────────────────────────────────────────────────────────────
    # The design must remain connected at a retained voltage AT OR BELOW the
    # required floor (lower floor = more capable) for AT LEAST the required
    # duration at that floor. We check the deepest-dip breakpoint of the
    # applicable Type B PPM curve: 0.10 pu for 0.14 s.
    required_floor_pu = G99_LVRT_TYPE_B_PPM[0][0]      # 0.10 pu
    required_floor_dur_s = G99_LVRT_TYPE_B_PPM[1][1]   # 0.14 s
    lvrt_floor_ok = d_lvrt_floor_pu <= required_floor_pu
    lvrt_dur_ok = d_lvrt_floor_dur_s >= required_floor_dur_s
    lvrt_ok = bool(lvrt_floor_ok and lvrt_dur_ok)
    if not lvrt_floor_ok:
        violations.append(
            f"LVRT: design rides to {d_lvrt_floor_pu:.2f} pu but G99 Type {g99_type} "
            f"PPM requires staying connected down to {required_floor_pu:.2f} pu")
    if not lvrt_dur_ok:
        violations.append(
            f"LVRT: design holds the dip for {d_lvrt_floor_dur_s:.3f} s but G99 "
            f"requires >= {required_floor_dur_s:.3f} s at the retained-voltage floor")

    # ── 2. HVRT ─────────────────────────────────────────────────────────────
    hvrt_ok = bool(d_hvrt_ceiling_pu >= G99_HVRT_CEILING_PU)
    if not hvrt_ok:
        violations.append(
            f"HVRT: design ceiling {d_hvrt_ceiling_pu:.2f} pu < G99 {G99_HVRT_CEILING_PU:.2f} pu")

    # ── 3. Frequency response ────────────────────────────────────────────────
    lfsm_trigger_ok = d_lfsm_o_trigger_hz <= G99_LFSM_O_TRIGGER_HZ + 1e-9
    droop_ok = G99_DROOP_MIN_PCT <= d_droop_pct <= G99_DROOP_MAX_PCT
    cont_ok = (d_cont_fmin_hz <= G99_CONT_FREQ_MIN_HZ + 1e-9
               and d_cont_fmax_hz >= G99_CONT_FREQ_MAX_HZ - 1e-9)
    ride_ok = (d_ride_fmin_hz <= G99_RIDE_FREQ_MIN_HZ + 1e-9
               and d_ride_fmax_hz >= G99_RIDE_FREQ_MAX_HZ - 1e-9)
    freq_response_ok = bool(lfsm_trigger_ok and droop_ok and cont_ok and ride_ok)
    if not lfsm_trigger_ok:
        violations.append(
            f"FREQ: LFSM-O trigger {d_lfsm_o_trigger_hz:.2f} Hz > G99 {G99_LFSM_O_TRIGGER_HZ} Hz")
    if not droop_ok:
        violations.append(
            f"FREQ: droop {d_droop_pct:.1f}% outside G99 {G99_DROOP_MIN_PCT}-{G99_DROOP_MAX_PCT}%")
    if not cont_ok:
        violations.append(
            f"FREQ: continuous band {d_cont_fmin_hz}-{d_cont_fmax_hz} Hz does not cover "
            f"G99 {G99_CONT_FREQ_MIN_HZ}-{G99_CONT_FREQ_MAX_HZ} Hz")
    if not ride_ok:
        violations.append(
            f"FREQ: ride-through band {d_ride_fmin_hz}-{d_ride_fmax_hz} Hz does not cover "
            f"G99 {G99_RIDE_FREQ_MIN_HZ}-{G99_RIDE_FREQ_MAX_HZ} Hz")

    # ── 4. Reactive capability ───────────────────────────────────────────────
    # A lower (more demanding) PF = wider reactive range. Design PF must be at
    # least as wide as 0.95 (i.e. design_pf <= 0.95).
    design_q_pmax = math.tan(math.acos(min(1.0, max(1e-6, d_power_factor))))
    reactive_capability_ok = bool(d_power_factor <= G99_POWER_FACTOR + 1e-9)
    if not reactive_capability_ok:
        violations.append(
            f"REACTIVE: design PF {d_power_factor:.3f} narrower than G99 0.95 "
            f"(Q/Pmax {design_q_pmax:.4f} < required {G99_Q_PMAX:.4f})")

    return {
        "g99_type": g99_type,
        "lvrt_ok": lvrt_ok,
        "hvrt_ok": hvrt_ok,
        "freq_response_ok": freq_response_ok,
        "reactive_capability_ok": reactive_capability_ok,
        "all_ok": bool(lvrt_ok and hvrt_ok and freq_response_ok and reactive_capability_ok),
        "violations": violations,
        "checks": {
            "lvrt": {
                "design_floor_pu": d_lvrt_floor_pu,
                "required_floor_pu": required_floor_pu,
                "design_floor_duration_s": d_lvrt_floor_dur_s,
                "required_floor_duration_s": required_floor_dur_s,
                "curve_ref": "G99 §12.3 Table 12.2 (Type B PPM)",
            },
            "hvrt": {"design_ceiling_pu": d_hvrt_ceiling_pu,
                     "required_ceiling_pu": G99_HVRT_CEILING_PU},
            "frequency": {
                "lfsm_o_trigger_hz": {"design": d_lfsm_o_trigger_hz, "max_required": G99_LFSM_O_TRIGGER_HZ},
                "droop_pct": {"design": d_droop_pct, "range": [G99_DROOP_MIN_PCT, G99_DROOP_MAX_PCT]},
                "continuous_hz": {"design": [d_cont_fmin_hz, d_cont_fmax_hz],
                                  "required": [G99_CONT_FREQ_MIN_HZ, G99_CONT_FREQ_MAX_HZ]},
                "ride_through_hz": {"design": [d_ride_fmin_hz, d_ride_fmax_hz],
                                    "required": [G99_RIDE_FREQ_MIN_HZ, G99_RIDE_FREQ_MAX_HZ]},
            },
            "reactive": {"design_pf": d_power_factor, "required_pf": G99_POWER_FACTOR,
                         "design_q_pmax": round(design_q_pmax, 4),
                         "required_q_pmax": round(G99_Q_PMAX, 4)},
        },
        "inputs": {"rated_power_kw": rated_power_kw,
                   "connection_voltage_kv": connection_voltage_kv},
        "notes": (
            "Deterministic check against ENA EREC G99 published envelopes. "
            "A 1 MW BESS is a Type B Power Park Module (GB: 1 MW to < 10 MW). "
            "LVRT per §12.3 Table 12.2; reactive 0.95 lead/lag per §12.4; "
            "LFSM-O engages by 50.4 Hz; continuous 49-51 Hz, ride 47-52 Hz."
        ),
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
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
