#!/usr/bin/env python3
"""endpoint_resolution_test.py — bpy-free proveCatch for resolve_endpoint's
HEAD-NOUN discipline (2026-07-02, the f9dfc2918 distinguishing-token matcher
family applied to the topology endpoint resolver).

THE CATCH IT PROVES (v55): 'Pressure Transmitter' snapped onto 'Ro High
Pressure Pump' via the shared generic qualifier token 'pressure' — a signal
cable wore the pump's name and grew a water pipe tag. The head noun (the
part's IDENTITY) must be echoed by any winning candidate; a qualifier can
SUPPORT a match but never DECIDE one; no echo → None (honest drop).

Runs WITHOUT Blender: bpy/mathutils are stubbed before import (the module
only needs them at render time, not for the pure matching functions).

Run:  python3 scripts/blender-universal/endpoint_resolution_test.py
"""
import sys
import types
from pathlib import Path


class _Stub(types.ModuleType):
    """Attribute/call-absorbing stand-in for bpy/mathutils at import time."""
    def __getattr__(self, k):
        v = _Stub(self.__name__ + "." + k)
        setattr(self, k, v)
        return v

    def __call__(self, *a, **k):
        return _Stub(self.__name__ + "()")

    def __mro_entries__(self, bases):
        return (object,)


sys.modules.setdefault("bpy", _Stub("bpy"))
sys.modules.setdefault("mathutils", _Stub("mathutils"))
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE.parent / "blender-templates"))

import build_universal_scene as bus  # noqa: E402  (after the stubs, deliberately)


class _P:
    def __init__(self, name):
        self.name = name
        self.match_tokens = bus.tokenise(name)


def main() -> int:
    parts = [_P("Ro High Pressure Pump"), _P("Fresh Water Tank"),
             _P("Drain Water Tank"), _P("Irrigation Pump"), _P("Cloth Filter"),
             _P("Degasser")]
    bad = 0

    def chk(label, cond):
        nonlocal bad
        print(("  ✓ " if cond else "  ✗ ") + label)
        if not cond:
            bad += 1

    r = bus.resolve_endpoint("Pressure Transmitter", parts)
    chk("v55 catch: 'Pressure Transmitter' never snaps onto the pump (qualifier "
        "'pressure' cannot decide) → None", r is None)
    r = bus.resolve_endpoint("pressure_transmitter", parts)
    chk("snake_case variant also drops", r is None)
    r = bus.resolve_endpoint("ro_high_pressure_pump", parts)
    chk("the pump still resolves to ITSELF",
        r is not None and r.name == "Ro High Pressure Pump")
    r = bus.resolve_endpoint("fresh_water_tank", parts)
    chk("exact-name endpoints unaffected",
        r is not None and r.name == "Fresh Water Tank")
    r = bus.resolve_endpoint("drain_water_tanks", parts)
    chk("plural head folds ('tanks'≡'tank')",
        r is not None and r.name == "Drain Water Tank")
    r = bus.resolve_endpoint("co2_degasser", parts)
    chk("an unqualified candidate still matches a qualified endpoint "
        "(the CO2-degasser rule survives)", r is not None and r.name == "Degasser")

    # ── proveCatch: "<N> m² area" is a SURFACE area, never a plan footprint ──────
    # (2026-07-04, Codema v75) — a skeleton-derived "Uf Membrane Bank" representative
    # BoM line carrying "364 m² area" (a membrane SURFACE area) was read as a plan
    # FOOTPRINT: sqrt(364)*1000 ≈ 19,079 mm side → a ~19 m rogue skid_box sited nowhere
    # near its real siblings. The router then favoured that rogue box (token overlap on
    # 'uf'/'module') over the part's genuinely-placed sibling, dragging OTHER edges into
    # a long stray-pipe detour off the platform. Fix: an area dim is treated as NO
    # USABLE FOOTPRINT (same as no dim at all) → the shape's TYPE_DEFAULTS apply.
    area_part = bus.Part("Pentair X-Flow X-Line 64 UF Module", "mass_fluid_transport_process",
                          "mass_fluid_transport_process", 45, "skid_box",
                          {"kind": "area", "area_m2": 364.0}, 1, "representative component")
    rd = bus.resolved_dims_mm(area_part)
    chk("a 364 m² AREA dim never mints an oversized (>5 m) footprint from sqrt(area)",
        rd.get("w", 0) < 5000 and rd.get("d", 0) < 5000)
    chk("a 364 m² AREA dim falls to the shape's TYPE_DEFAULTS footprint (not 'explicit')",
        rd.get("explicit") is False
        and rd.get("w") == bus.TYPE_DEFAULTS_MM["skid_box"]["w"]
        and rd.get("d") == bus.TYPE_DEFAULTS_MM["skid_box"]["d"])
    h = bus._dimensioned_height_mm(area_part)
    chk("an AREA dim is never read as an explicit HEIGHT either", h is None)

    print("endpoint-resolution selftest: OK" if bad == 0
          else f"endpoint-resolution selftest: FAIL ({bad})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
