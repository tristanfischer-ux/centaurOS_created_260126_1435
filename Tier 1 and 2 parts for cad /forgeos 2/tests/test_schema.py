"""
Tests for schema export — JSON Schema, LLM tools, UI controls.
"""

from core.schema import (
    grammar_to_json_schema,
    grammar_to_llm_tool,
    grammar_to_ui_controls,
    get_all_grammars,
)
from grammars.building import BuildingGrammar
from grammars.drone import DroneGrammar


def test_json_schema_building():
    schema = grammar_to_json_schema(BuildingGrammar())
    assert schema["title"] == "Building / Architecture"
    assert "properties" in schema
    assert "length" in schema["properties"]
    assert schema["properties"]["length"]["type"] == "number"
    assert schema["properties"]["length"]["minimum"] == 3000


def test_json_schema_drone():
    schema = grammar_to_json_schema(DroneGrammar())
    assert "prop_size_inch" in schema["properties"]
    assert schema["properties"]["frame_material"]["type"] == "string"
    assert "enum" in schema["properties"]["frame_material"]


def test_llm_tool_format():
    tool = grammar_to_llm_tool(DroneGrammar())
    assert tool["name"] == "design_drone"
    assert "input_schema" in tool
    assert tool["input_schema"]["type"] == "object"
    assert "properties" in tool["input_schema"]


def test_ui_controls():
    controls = grammar_to_ui_controls(BuildingGrammar())
    assert len(controls) > 0
    
    # Length should be a slider with mm suffix
    length_ctrl = next(c for c in controls if c["name"] == "length")
    assert length_ctrl["type"] == "slider"
    assert length_ctrl["suffix"] == "mm"
    assert length_ctrl["min"] == 3000
    
    # has_loft should be a toggle
    loft_ctrl = next(c for c in controls if c["name"] == "has_loft")
    assert loft_ctrl["type"] == "toggle"


def test_grammar_registry():
    registry = get_all_grammars()
    assert "building" in registry
    assert "drone" in registry
    assert len(registry) == 2


def test_all_grammars_produce_valid_schemas():
    for name, grammar in get_all_grammars().items():
        schema = grammar_to_json_schema(grammar)
        assert schema["type"] == "object", f"{name} schema not an object"
        assert len(schema["properties"]) > 0, f"{name} has no properties"
        
        tool = grammar_to_llm_tool(grammar)
        assert "input_schema" in tool, f"{name} tool missing input_schema"
        
        controls = grammar_to_ui_controls(grammar)
        assert len(controls) > 0, f"{name} has no UI controls"
