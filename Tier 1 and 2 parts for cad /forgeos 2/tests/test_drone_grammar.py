"""
Tests for the DroneGrammar.
Run: cd forgeos && python -m pytest tests/ -v
"""

import math

from grammars.drone import DroneGrammar, MOTOR_PRESETS, FC_PRESETS


def test_grammar_identity():
    g = DroneGrammar()
    assert g.name == "drone"
    assert "quadcopter" in g.description.lower() or "fpv" in g.description.lower()


def test_defaults_are_valid():
    g = DroneGrammar()
    defaults = g.defaults()
    result = g.validate_params(defaults)
    assert result.passed, f"Defaults failed validation: {result.errors}"


def test_derive_skeleton_5inch():
    """5" build should produce ~200mm wheelbase."""
    g = DroneGrammar()
    skeleton = g.derive_skeleton(g.defaults())

    # 5" prop = 127mm, with 8mm clearance, wheelbase should be ~200mm
    assert 180 < skeleton["wheelbase"] < 250, f"Wheelbase {skeleton['wheelbase']:.0f}mm out of range"
    assert 80 < skeleton["arm_length"] < 130, f"Arm length {skeleton['arm_length']:.0f}mm out of range"

    # Auto-derived arm thickness for CF should be ~4mm for 5"
    assert 3.0 <= skeleton["arm_thickness"] <= 6.0

    # Should have 4 motor positions
    assert len(skeleton["motor_positions"]) == 4


def test_derive_skeleton_3inch():
    """3" build should produce smaller wheelbase."""
    g = DroneGrammar()
    skeleton = g.derive_skeleton({**g.defaults(), "prop_size_inch": 3.0, "motor_size": "1404"})

    assert 100 < skeleton["wheelbase"] < 180
    assert len(skeleton["motor_positions"]) == 4


def test_derive_skeleton_7inch():
    """7" build should produce larger wheelbase."""
    g = DroneGrammar()
    skeleton = g.derive_skeleton({**g.defaults(), "prop_size_inch": 7.0, "motor_size": "2806"})

    assert 250 < skeleton["wheelbase"] < 380
    assert len(skeleton["motor_positions"]) == 4


def test_build_default_drone():
    g = DroneGrammar()
    assembly, result = g.generate({})

    assert result.passed, f"Build failed: {result}"
    # Expected parts: 2 plates + 4 standoffs + 4 arms + 4 motors + 4 prop discs = 18
    assert result.metrics["part_count"] == 18


def test_motor_positions_symmetry():
    """Motor positions should be symmetric about both axes for true_x."""
    g = DroneGrammar()
    skeleton = g.derive_skeleton(g.defaults())
    positions = skeleton["motor_positions"]

    # All motors should be same distance from centre
    distances = [math.sqrt(x**2 + y**2) for x, y in positions]
    assert max(distances) - min(distances) < 0.1, "Motors not equidistant from centre"

    # Sum of all X coords and Y coords should be ~0 (symmetric)
    sum_x = sum(x for x, y in positions)
    sum_y = sum(y for x, y in positions)
    assert abs(sum_x) < 1.0, f"X asymmetry: {sum_x}"
    assert abs(sum_y) < 1.0, f"Y asymmetry: {sum_y}"


def test_prop_clearance_constraint():
    """Props should not overlap with default settings."""
    g = DroneGrammar()
    skeleton = g.derive_skeleton(g.defaults())

    # Check manually that adjacent props don't overlap
    positions = skeleton["motor_positions"]
    prop_r = skeleton["prop_diameter_mm"] / 2
    clearance = skeleton["prop_clearance_mm"]

    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            dx = positions[i][0] - positions[j][0]
            dy = positions[i][1] - positions[j][1]
            dist = math.sqrt(dx*dx + dy*dy)
            assert dist >= 2 * prop_r + clearance, \
                f"Motors {i+1} and {j+1}: distance {dist:.1f}mm < min {2*prop_r + clearance:.1f}mm"


def test_export_formats():
    """Verify all export formats produce files."""
    import tempfile
    import os

    g = DroneGrammar()
    assembly, result = g.generate({})
    assert result.passed

    with tempfile.TemporaryDirectory() as tmpdir:
        base = os.path.join(tmpdir, "test_drone")
        paths = g.export(assembly, base, formats=["step", "glb", "stl"])

        for fmt in ["step", "glb", "stl"]:
            assert fmt in paths, f"Missing {fmt} export"
            assert os.path.exists(paths[fmt]), f"File not created: {paths[fmt]}"
            assert os.path.getsize(paths[fmt]) > 100, f"File too small: {paths[fmt]}"


def test_stretch_x_config():
    """Stretch-X should produce valid but non-symmetric arm angles."""
    g = DroneGrammar()
    assembly, result = g.generate({"config_type": "stretch_x"})
    assert result.passed, f"Stretch-X build failed: {result}"
    assert result.metrics["part_count"] == 18
