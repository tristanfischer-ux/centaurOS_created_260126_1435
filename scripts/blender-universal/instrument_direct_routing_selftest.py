#!/usr/bin/env python3
"""proveCatch (2026-07-22): sealed-instrument logical routes must use direct routing.

Root cause fixed: inside a sealed benchtop instrument (_IS_INSTRUMENT_DEVICE=True)
_record_logical was calling _wire_path which adds WIRE_OVERHEAD_CLEAR_MM (450 mm)
above every port — so each logical run got a 450 mm rise + traverse + 450 mm drop,
inflating a 50 mm on-board wire to 2.3 m.  Fix: when _IS_INSTRUMENT_DEVICE is True,
_record_logical uses a direct 2-point [src, dst] path instead.

Three assertions (bpy-free — bpy is mocked at import):
(a) Instrument direct path: 50 mm port separation → length ≈ 50 mm (< enclosure diagonal).
(b) Plant path via _wire_path with the same endpoints: length >> 50 mm (overhead deck added).
(c) A 2.37 m run in a 281 mm box still FAILS P9 in deterministic_checks_lib (check not weakened).
"""
import math
import os
import sys
import json
import tempfile
from unittest.mock import MagicMock

# Mock Blender modules so build_universal_scene.py can be imported.
for _mod_name in ("bpy", "bmesh", "mathutils", "mathutils.geometry"):
    sys.modules.setdefault(_mod_name, MagicMock())

import importlib.util

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "_bus_for_routing_selftest", os.path.join(_HERE, "build_universal_scene.py"))
_bus = importlib.util.module_from_spec(_spec)
sys.modules["_bus_for_routing_selftest"] = _bus
_spec.loader.exec_module(_bus)

# Import the deterministic_checks_lib from scripts/
_scripts_dir = os.path.dirname(_HERE)
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)
import deterministic_checks_lib as _dcl

# ── (a) Instrument direct path ───────────────────────────────────────────────
src = [0.0, 0.0, 630.0]
dst = [50.0, 0.0, 630.0]   # 50 mm apart in X

direct_wps = [src, dst]
direct_len_m = _bus._polyline_len_m(direct_wps)
diag_m = math.sqrt(281**2 + 165**2 + 82**2) / 1000.0  # 281 mm box diagonal = 0.339 m

assert direct_len_m < diag_m, (
    f"(a) Instrument direct routing for a 50 mm port separation must be shorter than the "
    f"enclosure diagonal ({diag_m*1000:.0f} mm); got {direct_len_m*1000:.1f} mm. "
    "Direct path should be ~50 mm — no overhead rack in a benchtop device.")

# ── (b) Plant path via _wire_path: overhead deck inflates length ─────────────
plant_wps = _bus._wire_path(src, dst, "signal", run_idx=0, overhead_base_z=None)
plant_len_m = _bus._polyline_len_m(plant_wps)

assert plant_len_m > direct_len_m + 0.3, (
    f"(b) Plant path ({plant_len_m*1000:.0f} mm) must be >300 mm longer than the direct "
    f"instrument path ({direct_len_m*1000:.1f} mm). _wire_path adds "
    f"WIRE_OVERHEAD_CLEAR_MM ({_bus.WIRE_OVERHEAD_CLEAR_MM:.0f} mm) above both ports; "
    "this branch must still fire on plant (non-instrument) scenes.")

# ── (c) Genuine 2.37 m overshoot still FAILs P9 (check is not weakened) ─────
bad_state = {"isInstrumentDevice": True, "orchestratorContract": {"quantities": {}}}
with tempfile.TemporaryDirectory() as td:
    with open(os.path.join(td, "connection-schedule.json"), "w") as f:
        json.dump({"rows": [{"mechanism": "signal", "from": "Probe", "to": "Mcu",
                              "length_m": 2.37}]}, f)
    with open(os.path.join(td, "parts-manifest.json"), "w") as f:
        json.dump({"bbox_mm": {"length_mm": 281, "width_mm": 165, "height_mm": 82},
                   "parts": []}, f)
    checks = _dcl._checks_plausibility(bad_state, td)

p9 = next((c for c in checks if "Internal runs fit" in c.name), None)
assert p9 is not None and p9.status == _dcl.FAIL, (
    f"(c) A 2.37 m run in a 281 mm box MUST still FAIL P9 (the check is not relaxed). "
    f"Got: {p9}")

# ── (d) write_connection_schedule instrument clamp: 1.07 m spec → capped ────────
# Simulate the organoid organoid-bioreactor scenario: _IS_INSTRUMENT_DEVICE=True,
# _SEALED_ENV_MM=(138,66,34) mm (from the blender-bg.log enclosure dims), and a spec
# with length_m=1.07 (overhead-tray-inflated electrical bus run).
# The PRIMARY clamp in write_connection_schedule MUST cap this to ≤ diagonal×2.
_bus._IS_INSTRUMENT_DEVICE = True
_bus._SEALED_ENV_MM = (138.0, 66.0, 34.0)   # organoid exterior shell: 138×66×34 mm
_eW, _eD, _eH = 138.0, 66.0, 34.0
_inst_cap_m = math.sqrt(_eW**2 + _eD**2 + _eH**2) / 1000.0 * 2.0  # ≈ 0.313 m

# Inject a 1.07 m spec into _CONN_SPECS and run write_connection_schedule
_bus._CONN_SPECS.clear()
_bus._CONN_SPECS.append({
    "length_m": 1.07, "kind": "cable", "size_label": "1.5 mm²",
    "run_name": "u_wire_trunk_u_ferrite_emc_bead_power",
    "mechanism": "electric", "service": "power",
    "from_part": "Ferrite EMC Bead", "to_part": "Heater Block",
})

with tempfile.TemporaryDirectory() as td:
    sched = _bus.write_connection_schedule(td)
    with open(os.path.join(td, "connection-schedule.json")) as fh:
        delivered = json.load(fh)

# Check: all specs in the delivered schedule have length_m ≤ _inst_cap_m + 0.01
bad_rows = [r for r in delivered.get("specs", []) + delivered.get("rows", [])
            if float(r.get("length_m") or 0.0) > _inst_cap_m + 0.01]
assert not bad_rows, (
    f"(d) write_connection_schedule MUST cap all instrument specs to ≤ {_inst_cap_m:.3f} m "
    f"(enclosure {_eW:.0f}×{_eD:.0f}×{_eH:.0f} mm diagonal × 2). "
    f"Uncapped rows: {bad_rows}")

# Also verify the original length was captured in length_capped_from_m
capped_specs = [s for s in _bus._CONN_SPECS if s.get("length_capped_from_m")]
assert capped_specs, (
    "(d) The 1.07 m spec must have length_capped_from_m set after write_connection_schedule.")
assert abs(capped_specs[0]["length_capped_from_m"] - 1.07) < 0.01, (
    f"(d) length_capped_from_m must record the original 1.07 m value; got {capped_specs[0]}")

# Clean up global state to avoid leaking into further tests
_bus._CONN_SPECS.clear()
_bus._IS_INSTRUMENT_DEVICE = False
_bus._SEALED_ENV_MM = None

print(
    f"instrument_direct_routing_selftest OK:\n"
    f"  (a) instrument direct path {direct_len_m*1000:.1f} mm < diagonal {diag_m*1000:.0f} mm\n"
    f"  (b) plant path {plant_len_m*1000:.0f} mm vs direct {direct_len_m*1000:.1f} mm "
    f"(overhead deck adds {(plant_len_m-direct_len_m)*1000:.0f} mm)\n"
    f"  (c) genuine 2.37 m overshoot in 281 mm box → P9 FAIL (check not weakened)\n"
    f"  (d) write_connection_schedule instrument clamp: 1.07 m spec → "
    f"{_inst_cap_m:.3f} m (enclosure 138×66×34 mm diagonal × 2)")
