"""
Integration tests — verify all grammars work together and the registry is consistent.
Run: cd forgeos && python -m pytest tests/test_integration.py -v
"""

import os
import tempfile

from grammars import GRAMMAR_REGISTRY, get_grammar
from grammars.building import BuildingGrammar
from grammars.drone import DroneGrammar
from core.schema import get_all_grammars


# ═══════════════════════════════════════════════════════════════
# Registry
# ═══════════════════════════════════════════════════════════════

def test_registry_has_all_grammars():
    assert "building" in GRAMMAR_REGISTRY
    assert "drone" in GRAMMAR_REGISTRY


def test_get_grammar_by_name():
    g = get_grammar("building")
    assert g.name == "building"
    g = get_grammar("drone")
    assert g.name == "drone"


def test_get_grammar_invalid_raises():
    import pytest
    with pytest.raises(ValueError, match="Unknown grammar"):
        get_grammar("nonexistent")


def test_all_grammars_have_unique_names():
    names = [cls().name for cls in GRAMMAR_REGISTRY.values()]
    assert len(names) == len(set(names)), f"Duplicate grammar names: {names}"


def test_schema_registry_matches_grammar_registry():
    """core.schema.get_all_grammars() should cover the same set as GRAMMAR_REGISTRY."""
    schema_names = set(get_all_grammars().keys())
    registry_names = set(GRAMMAR_REGISTRY.keys())
    assert schema_names == registry_names


# ═══════════════════════════════════════════════════════════════
# All grammars build
# ═══════════════════════════════════════════════════════════════

def test_all_grammars_build_with_defaults():
    for name, cls in GRAMMAR_REGISTRY.items():
        g = cls()
        assembly, result = g.generate({})
        assert result.passed, f"{name} failed: {result}"
        assert result.metrics["part_count"] > 0, f"{name} produced 0 parts"


def test_all_grammars_export_all_formats():
    with tempfile.TemporaryDirectory() as tmpdir:
        for name, cls in GRAMMAR_REGISTRY.items():
            g = cls()
            assembly, result = g.generate({})
            assert result.passed

            base = os.path.join(tmpdir, name)
            paths = g.export(assembly, base, formats=["step", "glb", "stl"])

            for fmt in ["step", "glb", "stl"]:
                assert fmt in paths, f"{name} missing {fmt}"
                size = os.path.getsize(paths[fmt])
                assert size > 100, f"{name}.{fmt} only {size} bytes"


def test_all_grammars_have_constraints():
    for name, cls in GRAMMAR_REGISTRY.items():
        g = cls()
        assert len(g.constraints()) > 0, f"{name} has no constraints"


def test_all_grammars_have_param_specs():
    for name, cls in GRAMMAR_REGISTRY.items():
        g = cls()
        specs = g.param_specs()
        assert len(specs) >= 2, f"{name} has only {len(specs)} param specs"


# ═══════════════════════════════════════════════════════════════
# Cross-grammar isolation
# ═══════════════════════════════════════════════════════════════

def test_grammars_dont_share_state():
    bg = BuildingGrammar()
    dg = DroneGrammar()

    _, r1 = bg.generate({})
    _, r2 = dg.generate({})
    _, r3 = bg.generate({})
    _, r4 = dg.generate({})

    assert r1.metrics["part_count"] == r3.metrics["part_count"]
    assert r2.metrics["part_count"] == r4.metrics["part_count"]
    assert r1.metrics["envelope_mm"] == r3.metrics["envelope_mm"]
    assert r2.metrics["envelope_mm"] == r4.metrics["envelope_mm"]


def test_grammars_produce_different_scales():
    _, r_house = BuildingGrammar().generate({})
    _, r_drone = DroneGrammar().generate({})

    house_dims = [float(d.strip()) for d in r_house.metrics["envelope_mm"].split("x")]
    drone_dims = [float(d.strip()) for d in r_drone.metrics["envelope_mm"].split("x")]

    assert house_dims[0] > drone_dims[0] * 10
    assert house_dims[1] > drone_dims[1] * 10
