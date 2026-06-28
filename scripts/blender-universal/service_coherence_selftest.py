#!/usr/bin/env python3
"""service_coherence_selftest.py — proveCatch for the render's SERVICE-COHERENCE guards (Tristan
2026-06-28, LAYOUT-FIX-PLAN P1). A process-FLUID line must never terminate on a pure ELECTRICAL /
CONTROL device — the v33 hero drew a "Fresh Water Tank → Mains Incomer" water pipe (a 15-24 m stray
beam) because the cross-module augmenter's fluid_only repr-picker landed a water leg on a switchboard.
`_endpoint_is_electrical` is the predicate the route-reconcile DEFECT-1 drop uses (alongside the
pre-existing `_endpoint_is_pure_instrument`) to delete that edge AND its drawn geometry. Wired into
verify-engine-guards.sh. bpy is mocked so the pure predicate runs head-less."""
import sys
from unittest.mock import MagicMock

sys.modules["bpy"] = MagicMock()
sys.modules["mathutils"] = MagicMock()
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import build_universal_scene as b  # noqa: E402

# (name, must_be_flagged_as_electrical)
CASES = [
    ("Mains Incomer", True), ("Main Switchboard", True), ("Motor Control Center", True),
    ("Distribution Transformer", True), ("DC Bus Busbar", True), ("415V Switchgear", True),
    # fluid / process parts a water line MAY legitimately land on — must NOT be flagged
    ("Fresh Water Tank", False), ("Irrigation Pump", False), ("Pneumatic Control Valve", False),
    ("RO Skid", False), ("GAC Filter", False), ("Degasser Tower", False), ("Drain Sump", False),
]

fails = [(n, b._endpoint_is_electrical(n), w) for n, w in CASES if b._endpoint_is_electrical(n) != w]
if fails:
    for n, got, want in fails:
        print(f"  ✗ _endpoint_is_electrical({n!r}) = {got}  want {want}")
    print(f"service-coherence selftest: {len(fails)} FAILED")
    sys.exit(1)
print(f"service-coherence selftest OK ({len(CASES)} cases: fluid line never terminates on an electrical device)")
