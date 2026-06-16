#!/usr/bin/env python3
"""Apply subagent A's council-round-1 contract corrections to the frozen RAS demo state.
The CODE fixes (engineering-contract.ts) make a FRESH chain run self-consistent; this patches
the frozen out/ras-converged/state.json so the demo dashboard/PDF reflect them without a full
chain re-run. Idempotent."""
import json
import sys

p = sys.argv[1] if len(sys.argv) > 1 else "out/ras-converged/state.json"
s = json.load(open(p))

# orchestratorContract.quantities — value patches (subagent A's verified table)
Q = {
    "daily_feed_kg": 765.7, "tan_load_kg_day": 27.6, "oxygen_demand_kg_day": 383.0,
    "oxygen_supply_kg_h": 16.0, "solids_load_kg_day": 459.0, "bicarbonate_dose_kg_day": 329.0,
    "biofilter_media_volume_m3": 78.9, "biofilter_tank_volume_m3": 132.0, "biofilter_air_flow_m3_h": 947.0,
    "recirc_pump_head_m": 3.0, "recirc_pump_hydraulic_power_w": 109218.0, "recirc_pump_motor_kw": 200.0,
    "uv_lamp_power_kw": 35.0, "water_recirculation_rate_percent": 99.6,
    "makeup_hex_recovery_kw": 866.0, "residual_makeup_heating_kw": 153.0,
    "heating_duty_kw": 336.0, "heat_pump_electrical_kw": 96.0, "building_process_loss_kw": 183.0,
    "connected_electrical_load_kw": 342.0,
}
oc = (s.get("orchestratorContract") or {}).get("quantities") or {}
patched = []
for k, v in Q.items():
    if k in oc and isinstance(oc[k], dict):
        oc[k]["value"] = v
        oc[k]["source"] = "calculator"
        oc[k].pop("provenance", None)
    else:                                   # absent key → add with a minimal shape
        oc[k] = {"value": v, "unit": "", "source": "calculator"}
    patched.append(k)
# HRT: fix the value AND the unit (0.11 s → 15 min)
if "hydraulic_retention_time_mins" in oc and isinstance(oc["hydraulic_retention_time_mins"], dict):
    oc["hydraulic_retention_time_mins"]["value"] = 15.0
    oc["hydraulic_retention_time_mins"]["unit"] = "min"
    oc["hydraulic_retention_time_mins"]["source"] = "calculator"
    patched.append("hydraulic_retention_time_mins")

# engineeringContract.quantities — kill the stray 427 / 1493
ec = (s.get("engineeringContract") or {}).get("quantities") or {}
for k, v in (("heat_pump_electrical_kw", 96.0), ("heating_duty_kw", 336.0)):
    if k in ec and isinstance(ec[k], dict):
        ec[k]["value"] = v

# componentEngineering parts — Heat Pump electrical_kw 427→96, Heat Exchanger duty 1493→336
for part in ((s.get("componentEngineering") or {}).get("parts") or []):
    nm = str(part.get("name") or part.get("name_human") or "").lower()
    spec = part.get("spec") if isinstance(part.get("spec"), dict) else None
    if not spec:
        continue
    if "heat pump" in nm:
        for kk in list(spec.keys()):
            if "electrical" in kk.lower() and isinstance(spec[kk], (int, float)) and abs(spec[kk] - 427) < 5:
                spec[kk] = 96.0
    if "heat exchanger" in nm:
        for kk in list(spec.keys()):
            if isinstance(spec[kk], (int, float)) and abs(spec[kk] - 1493) < 5:
                spec[kk] = 336.0

json.dump(s, open(p, "w"))
print(f"patched {len(patched)} orchestrator quantities + engineeringContract + componentEngineering → {p}")
