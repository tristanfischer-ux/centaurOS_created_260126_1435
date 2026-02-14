"""
Grammar selection integration tests.

Tests that the grammar registry returns correct structure and that
grammars can be matched by keywords. Uses Supabase to fetch grammars.
Skips when Supabase env vars are not configured.

Run: pytest tests/test_grammar_selection.py -v
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pytest tests/test_grammar_selection.py -v
"""

import os
import pytest

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None


def _get_supabase_client():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    return create_client(url, key)


@pytest.fixture
def supabase():
    client = _get_supabase_client()
    if client is None:
        pytest.skip("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set")
    return client


@pytest.mark.skipif(create_client is None, reason="supabase-py not installed")
def test_grammar_registry_returns_grammars(supabase):
    """Fetch grammar registry and verify structure."""
    r = supabase.table("cad_grammars").select(
        "id, name, display_name, domain_keywords, example_prompts, param_specs, defaults"
    ).eq("is_active", True).neq("name", "__core_library__").order("name").execute()

    assert r.data is not None
    grammars = r.data
    assert len(grammars) >= 1, "Registry should have at least one grammar"

    for g in grammars:
        assert "name" in g and isinstance(g["name"], str)
        assert "display_name" in g and isinstance(g["display_name"], str)
        assert "domain_keywords" in g and isinstance(g["domain_keywords"], list)
        assert "example_prompts" in g and isinstance(g["example_prompts"], list)
        assert "param_specs" in g and isinstance(g["param_specs"], list)
        assert "defaults" in g and isinstance(g["defaults"], dict)


@pytest.mark.skipif(create_client is None, reason="supabase-py not installed")
def test_building_grammar_has_expected_keywords(supabase):
    """Building grammar should match house/building-related prompts."""
    r = supabase.table("cad_grammars").select("name, domain_keywords").eq(
        "name", "building"
    ).eq("is_active", True).single().execute()

    if not r.data:
        pytest.skip("building grammar not in database")
    kw = r.data.get("domain_keywords") or []
    expected = {"house", "building", "architecture", "residential", "cottage", "cabin"}
    overlap = expected & set(k.lower() for k in kw)
    assert len(overlap) >= 2, f"Building should have keywords like {expected}, got {kw}"


@pytest.mark.skipif(create_client is None, reason="supabase-py not installed")
def test_bracket_grammar_has_param_specs(supabase):
    """Bracket grammar should have width, height, thickness params."""
    r = supabase.table("cad_grammars").select("name, param_specs, defaults").eq(
        "name", "bracket"
    ).eq("is_active", True).single().execute()

    if not r.data:
        pytest.skip("bracket grammar not in database")
    specs = r.data.get("param_specs") or []
    names = [s.get("name") for s in specs if isinstance(s, dict)]
    assert "width" in names
    assert "height" in names
    assert "thickness" in names
    defaults = r.data.get("defaults") or {}
    assert "width" in defaults
    assert "height" in defaults
    assert "thickness" in defaults


@pytest.mark.skipif(create_client is None, reason="supabase-py not installed")
def test_core_library_exists(supabase):
    """__core_library__ row should exist for runtime resolution."""
    r = supabase.table("cad_grammars").select("name, python_code").eq(
        "name", "__core_library__"
    ).eq("is_active", True).single().execute()

    assert r.data is not None
    assert "python_code" in r.data
    code = r.data["python_code"] or ""
    assert "DomainGrammar" in code
    assert "ParamSpec" in code
    assert "Constraint" in code
