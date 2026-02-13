"""
ForgeOS Core — Schema Export
==============================

Generates JSON schemas from grammar param_specs for:
- Web UI parameter panels (auto-generate sliders, dropdowns, toggles)
- API documentation
- LLM tool definitions (function calling)
"""

import json
from typing import Any, Dict, List

from core.grammar import DomainGrammar, ParamSpec


def grammar_to_json_schema(grammar: DomainGrammar) -> Dict[str, Any]:
    """
    Convert a grammar's param_specs into a JSON Schema (draft-07).
    
    Used for: API validation, web UI generation, documentation.
    """
    properties = {}
    required = []

    for spec in grammar.param_specs():
        prop: Dict[str, Any] = {"description": spec.description}

        if spec.unit:
            prop["description"] += f" ({spec.unit})"

        if spec.type == "float":
            prop["type"] = "number"
            if spec.min_val is not None: prop["minimum"] = spec.min_val
            if spec.max_val is not None: prop["maximum"] = spec.max_val
        elif spec.type == "int":
            prop["type"] = "integer"
            if spec.min_val is not None: prop["minimum"] = spec.min_val
            if spec.max_val is not None: prop["maximum"] = spec.max_val
        elif spec.type == "bool":
            prop["type"] = "boolean"
        elif spec.type == "enum":
            prop["type"] = "string"
            prop["enum"] = spec.enum_options or []
        elif spec.type == "list":
            prop["type"] = "array"
            prop["items"] = {"type": "number"}
        elif spec.type == "dict_list":
            prop["type"] = "array"
            prop["items"] = {"type": "object"}

        if spec.default is not None:
            prop["default"] = spec.default
        elif spec.type not in ("list", "dict_list"):
            required.append(spec.name)

        properties[spec.name] = prop

    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": grammar.display_name,
        "description": grammar.description,
        "type": "object",
        "properties": properties,
    }
    if required:
        schema["required"] = required

    return schema


def grammar_to_llm_tool(grammar: DomainGrammar) -> Dict[str, Any]:
    """
    Convert a grammar into an LLM function-calling tool definition.
    
    Compatible with Anthropic and OpenAI tool formats.
    """
    schema = grammar_to_json_schema(grammar)
    return {
        "name": f"design_{grammar.name}",
        "description": f"Generate a {grammar.display_name} design. {grammar.description}",
        "input_schema": {
            "type": "object",
            "properties": schema["properties"],
            "required": schema.get("required", []),
        },
    }


def grammar_to_ui_controls(grammar: DomainGrammar) -> List[Dict[str, Any]]:
    """
    Convert a grammar into a list of UI control specs.
    
    Each control: {name, type, label, default, min, max, options, suffix, step}
    — everything a frontend needs to render parameter inputs.
    """
    controls = []
    defaults = grammar.defaults()

    for spec in grammar.param_specs():
        control: Dict[str, Any] = {
            "name": spec.name,
            "label": spec.description,
            "default": defaults.get(spec.name, spec.default),
        }

        if spec.type == "float":
            control["type"] = "slider" if (spec.min_val is not None and spec.max_val is not None) else "number"
            control["step"] = _guess_step(spec.min_val, spec.max_val)
            if spec.min_val is not None: control["min"] = spec.min_val
            if spec.max_val is not None: control["max"] = spec.max_val
            if spec.unit: control["suffix"] = spec.unit
        elif spec.type == "int":
            control["type"] = "slider" if (spec.min_val is not None and spec.max_val is not None) else "number"
            control["step"] = 1
            if spec.min_val is not None: control["min"] = spec.min_val
            if spec.max_val is not None: control["max"] = spec.max_val
        elif spec.type == "bool":
            control["type"] = "toggle"
        elif spec.type == "enum":
            control["type"] = "dropdown"
            control["options"] = spec.enum_options or []
        elif spec.type in ("list", "dict_list"):
            control["type"] = "json_editor"

        controls.append(control)

    return controls


def _guess_step(min_val, max_val) -> float:
    """Guess a reasonable slider step from range."""
    if min_val is None or max_val is None:
        return 1.0
    r = max_val - min_val
    if r > 10000: return 100
    elif r > 1000: return 10
    elif r > 100: return 1
    elif r > 10: return 0.1
    return 0.01


# ─── Grammar registry ────────────────────────────

def get_all_grammars() -> Dict[str, DomainGrammar]:
    """
    Return a dict of {name: grammar_instance} for all registered grammars.
    Import is deferred to avoid circular imports.
    """
    from grammars import BuildingGrammar, DroneGrammar
    grammars = [BuildingGrammar(), DroneGrammar()]
    return {g.name: g for g in grammars}
