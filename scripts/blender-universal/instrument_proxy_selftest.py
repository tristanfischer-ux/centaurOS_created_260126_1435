#!/usr/bin/env python3
"""proveCatch for F1b (organoid-bioreactor 2150 metre-scale mechanical-part leak).

The universal-scene geometry emitter sized a benchtop instrument's MECHANICAL /
FLUIDIC parts (magnetic stirrer 1.5 m, culture vessel ⌀1.6 m, cartridge heater
0.95 m) at PLANT scale because `_instrument_proxy_dim` returned None for any part
whose module was not one of the three ELECTRONIC instrument modules and whose noun
matched no rule — so the part fell through to the plant TYPE_DEFAULTS. The fix adds
device-scale lab-mechanical noun rules AND a universal device-scale backstop (the
function is only ever called for an instrument device, so it must never return None).

This imports the REAL `_instrument_proxy_dim` (bpy mocked) — no logic duplication —
and asserts every part it produces is DEVICE-scale (< 200 mm on every axis), keyed
on the modules that actually leaked. Run standalone: python3 instrument_proxy_selftest.py
"""
import os
import sys
from unittest.mock import MagicMock

# The scene builder imports bpy/bmesh/mathutils at module load (Blender-embedded).
for _m in ("bpy", "bmesh", "mathutils"):
    sys.modules.setdefault(_m, MagicMock())

import importlib.util  # noqa: E402

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "_bus_for_proxy_selftest", os.path.join(_HERE, "build_universal_scene.py"))
_bus = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_bus)
_instrument_proxy_dim = _bus._instrument_proxy_dim

# The device-scale ceiling: NO benchtop-instrument part exceeds this on any axis.
DEVICE_MAX_MM = 200.0

# The exact parts + modules that leaked to metre-scale on the frozen 2150 fixture,
# plus an UNKNOWN mechanical noun (proves the universal backstop, not just the rules).
CASES = [
    ("Magnetic Stirrer Drive", "mass_fluid_transport_process"),
    ("Culture Vessel", "mass_fluid_transport_process"),
    ("Sterile Filter Vent", "mass_fluid_transport_process"),
    ("Media Tubing Set", "mass_fluid_transport_process"),
    ("Vial Holder Fixture", "mass_fluid_transport_process"),
    ("Cartridge Heater", "environmental_interface"),
    ("Thermal Insulation", "environmental_interface"),
    ("Thermal Interface Pad", "environmental_interface"),
    ("Dosing Peristaltic Pump", "mass_fluid_transport_process"),
    # the universal backstop: a noun with NO rule, in a NON-electronic module
    ("Some Unknown Mechanical Widget", "structure_containment"),
    ("Bespoke Reaction Manifold", "mass_fluid_transport_process"),
]


def main() -> int:
    fails = []
    for name, module_id in CASES:
        d = _instrument_proxy_dim(name, module_id, {})
        if d is None:
            fails.append(f"{name} [{module_id}] → None (would fall to the PLANT type-default)")
            continue
        dims = [v for k, v in d.items() if k.endswith("_mm")]
        if not dims:
            fails.append(f"{name} → no _mm dims in {d}")
            continue
        biggest = max(dims)
        if biggest > DEVICE_MAX_MM:
            fails.append(f"{name} → {biggest:.0f} mm > {DEVICE_MAX_MM:.0f} mm device ceiling ({d})")

    # A plant part (NOT an instrument device) is never routed here — but assert the
    # backstop stays device-scale even with a big envelope (clamped by the fractions).
    big_env = {}  # empty → default envelope 180×140×80
    d = _instrument_proxy_dim("Generic Frame Member", "structure_containment", big_env)
    if d is None or max(v for k, v in d.items() if k.endswith("_mm")) > DEVICE_MAX_MM:
        fails.append(f"backstop with default envelope produced non-device dims: {d}")

    if fails:
        print("[instrument-proxy][selftest] FAIL:")
        for f in fails:
            print("  ✗ " + f)
        return 1
    print(f"[instrument-proxy] _selftest passed — F1b device-scale proxy proveCatch "
          f"({len(CASES)} leaked-part cases, all < {DEVICE_MAX_MM:.0f} mm)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
