"""
Tests for the BuildingGrammar.
Run: cd forgeos && python -m pytest tests/ -v
"""

import math

from grammars.building import BuildingGrammar


def test_grammar_identity():
    g = BuildingGrammar()
    assert g.name == "building"
    assert "BIM" in g.description or "building" in g.description.lower()


def test_defaults_are_valid():
    g = BuildingGrammar()
    defaults = g.defaults()
    result = g.validate_params(defaults)
    assert result.passed, f"Defaults failed validation: {result.errors}"


def test_derive_skeleton():
    g = BuildingGrammar()
    skeleton = g.derive_skeleton(g.defaults())

    # Roof geometry
    pitch_rad = math.radians(20.0)
    expected_rise = (3658 / 2) * math.tan(pitch_rad)
    assert abs(skeleton["roof_rise"] - expected_rise) < 1.0

    expected_eaves = 6000 - expected_rise
    assert abs(skeleton["eaves_height"] - expected_eaves) < 1.0

    # Interior width
    assert skeleton["interior_width"] == 3658 - 2 * 195

    # Ridge above eaves
    assert skeleton["ridge_height"] > skeleton["eaves_height"]


def test_build_default_house():
    g = BuildingGrammar()
    assembly, result = g.generate({})

    assert result.passed, f"Build failed: {result}"
    assert result.metrics["part_count"] == 15  # The known-good count from V3

    # Check envelope (approximate — allowing for foundation overhang and roof overhang)
    envelope = result.metrics["envelope_mm"]
    # Should be approximately 12400 × 4058 × 6200mm
    dims = [float(d.strip()) for d in envelope.split("x")]
    assert 12000 < dims[0] < 13000, f"X envelope wrong: {dims[0]}"
    assert 3600 < dims[1] < 4500, f"Y envelope wrong: {dims[1]}"
    assert 5500 < dims[2] < 7000, f"Z envelope wrong: {dims[2]}"


def test_no_loft_variant():
    g = BuildingGrammar()
    assembly, result = g.generate({"has_loft": False})

    assert result.passed, f"Build failed: {result}"
    # Without loft: no LoftFloor, CeilingSlab, LoftGuardrail, Staircase, Handrail = -5 parts
    assert result.metrics["part_count"] == 10


def test_custom_dimensions():
    g = BuildingGrammar()
    assembly, result = g.generate({
        "length": 8000,
        "width": 4000,
        "ridge_height": 5000,
        "roof_pitch_deg": 30.0,
    })
    assert result.passed, f"Build failed: {result}"


def test_constraint_min_ceiling_height():
    g = BuildingGrammar()
    skeleton = g.derive_skeleton({**g.defaults(), "ground_floor_height": 1800})
    # This should fail the min ceiling height constraint
    found_error = False
    for c in g.constraints():
        ok, msg = c.check(skeleton)
        if not ok and c.severity == "error":
            found_error = True
    assert found_error, "Should have flagged ceiling height < 2100mm"


def test_wall_face_count():
    """Walls with boolean-cut openings should have more faces than plain box (6)."""
    import cadquery as cq
    from grammars.building import _build_rect_wall, _cut_opening

    wall = _build_rect_wall(6000, 3000, 195)
    plain_faces = len(wall.faces().vals())
    assert plain_faces == 6

    # Cut one opening
    wall = _cut_opening(wall, 0, 0, 1050, 1000, 2100, 300)
    cut_faces = len(wall.faces().vals())
    assert cut_faces > 6, f"Expected >6 faces after cut, got {cut_faces}"


def test_gable_wall_is_pentagon():
    """Gable wall should have 7 faces: 2 pentagons + 5 rectangular sides."""
    from grammars.building import _build_gable_wall

    gable = _build_gable_wall(3658, 5334, 6000, 195)
    faces = len(gable.faces().vals())
    assert faces == 7, f"Expected 7 faces for pentagon extrusion, got {faces}"


def test_export_formats():
    """Verify all export formats produce files."""
    import tempfile
    import os

    g = BuildingGrammar()
    assembly, result = g.generate({})
    assert result.passed

    with tempfile.TemporaryDirectory() as tmpdir:
        base = os.path.join(tmpdir, "test_house")
        paths = g.export(assembly, base, formats=["step", "glb", "stl"])

        for fmt in ["step", "glb", "stl"]:
            assert fmt in paths, f"Missing {fmt} export"
            assert os.path.exists(paths[fmt]), f"File not created: {paths[fmt]}"
            assert os.path.getsize(paths[fmt]) > 100, f"File too small: {paths[fmt]}"
