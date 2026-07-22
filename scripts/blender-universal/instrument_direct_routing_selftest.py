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

print(
    f"instrument_direct_routing_selftest OK:\n"
    f"  (a) instrument direct path {direct_len_m*1000:.1f} mm < diagonal {diag_m*1000:.0f} mm\n"
    f"  (b) plant path {plant_len_m*1000:.0f} mm vs direct {direct_len_m*1000:.1f} mm "
    f"(overhead deck adds {(plant_len_m-direct_len_m)*1000:.0f} mm)\n"
    f"  (c) genuine 2.37 m overshoot in 281 mm box → P9 FAIL (check not weakened)")
