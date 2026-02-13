# How to Write a New Domain Grammar

This guide shows exactly how to create a grammar for a new product category.
Follow this structure — it matches the patterns in `building.py` and `drone.py`.

## File Structure

Create `grammars/your_domain.py` with these sections IN ORDER:

```python
"""
ForgeOS [Domain] Grammar — [Product Type] Design
===================================================
[1-3 sentences: what this designs, what approach it uses, all dims in mm]
"""

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

import cadquery as cq

from core.grammar import DomainGrammar, ParamSpec, Constraint, ValidationResult


# ═══════════════════════════════════════════════════════════════
# DATA STRUCTURES — domain-specific specs (optional, but recommended)
# ═══════════════════════════════════════════════════════════════

@dataclass
class ComponentSpec:
    """Describe any standard component this grammar uses."""
    name: str
    some_dimension: float
    # ...


# ═══════════════════════════════════════════════════════════════
# COMPONENT LIBRARY — preset values for standard parts (optional)
# ═══════════════════════════════════════════════════════════════

PRESETS = {
    "standard": ComponentSpec("Standard", 10.0),
}


# ═══════════════════════════════════════════════════════════════
# GEOMETRY PRIMITIVES — one function per shape type
# ═══════════════════════════════════════════════════════════════
# 
# Rules:
# - Each function creates ONE shape, returns cq.Workplane
# - Origin at a sensible local origin (centre of base, or start point)
# - Name starts with _build_ prefix
# - Document the coordinate system in the docstring
# - These get called by build(), never by the user directly

def _build_main_body(...) -> cq.Workplane:
    """Generate the main body. Origin at centre of base, Z up."""
    ...

def _build_feature(...) -> cq.Workplane:
    """Generate a feature. Origin at ..."""
    ...


# ═══════════════════════════════════════════════════════════════
# GRAMMAR CLASS
# ═══════════════════════════════════════════════════════════════

class YourGrammar(DomainGrammar):

    @property
    def name(self) -> str:
        return "your_domain"

    @property
    def display_name(self) -> str:
        return "Your Domain Name"

    @property
    def description(self) -> str:
        return "One line: what this grammar produces"

    def param_specs(self) -> List[ParamSpec]:
        return [
            # Use correct types:
            #   "float" for dimensions, angles, ratios
            #   "int" for counts
            #   "bool" for feature toggles
            #   "enum" for fixed choices (with enum_options=[...])
            #   "list" for lists of numbers (e.g., positions)
            #   "dict_list" for lists of dicts (e.g., feature specs)
            ParamSpec("length", "float", "mm", "Overall length", 100, 10, 1000),
            ParamSpec("material", "enum", None, "Material choice", "aluminium",
                      enum_options=["aluminium", "steel", "plastic"]),
        ]

    def defaults(self) -> Dict[str, Any]:
        return {
            "length": 100,
            "material": "aluminium",
        }

    def constraints(self) -> List[Constraint]:
        return [
            Constraint(
                "some_physical_limit",
                "Description of why this matters",
                lambda s: (s["some_value"] > 0, f"Value {s['some_value']} must be > 0"),
                severity="error"  # or "warning"
            ),
        ]

    def derive_skeleton(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Pure math: derive ALL dimensions from user params."""
        s = dict(params)
        # Every dimension build() needs must be computed here
        s["derived_value"] = s["length"] * 0.5
        return s

    def build(self, skeleton: Dict[str, Any]) -> cq.Assembly:
        """CadQuery geometry from skeleton."""
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_YourProduct")

        # Call primitive functions, position with Location, name every part
        body = _build_main_body(...)
        assy.add(body,
                 loc=cq.Location(cq.Vector(0, 0, 0)),
                 color=cq.Color(0.5, 0.5, 0.5),
                 name="MainBody")

        return assy
```

## Test File

Create `tests/test_your_domain_grammar.py`:

```python
"""Minimum required tests for a grammar."""
import math
from grammars.your_domain import YourGrammar


def test_grammar_identity():
    g = YourGrammar()
    assert g.name == "your_domain"

def test_defaults_are_valid():
    g = YourGrammar()
    result = g.validate_params(g.defaults())
    assert result.passed, f"Defaults failed: {result.errors}"

def test_derive_skeleton():
    g = YourGrammar()
    s = g.derive_skeleton(g.defaults())
    # Assert key derived values are in expected ranges
    assert s["derived_value"] > 0

def test_build_default():
    g = YourGrammar()
    assembly, result = g.generate({})
    assert result.passed, f"Build failed: {result}"
    assert result.metrics["part_count"] > 0

def test_export_formats():
    import tempfile, os
    g = YourGrammar()
    assembly, result = g.generate({})
    assert result.passed
    with tempfile.TemporaryDirectory() as d:
        paths = g.export(assembly, os.path.join(d, "test"), formats=["step", "glb"])
        for fmt in ["step", "glb"]:
            assert os.path.getsize(paths[fmt]) > 100
```

## Checklist Before Submitting

- [ ] All param_specs use correct types (float/int/bool/enum/list/dict_list)
- [ ] defaults() returns valid values for all required params
- [ ] derive_skeleton() is pure math (no `import cadquery`, no geometry ops)
- [ ] derive_skeleton() docstring lists all skeleton keys produced
- [ ] build() reads only from skeleton dict, names every part, sets colours
- [ ] constraints() validate physics/manufacturing limits
- [ ] All tests pass: `python -m pytest tests/test_your_domain_grammar.py -v`
- [ ] Grammar registered in `grammars/__init__.py`:
  - Add to imports: `from .your_domain import YourGrammar`
  - Add to `__all__`
  - Add to `GRAMMAR_REGISTRY`: `"your_domain": YourGrammar`
- [ ] Integration tests still pass: `python -m pytest tests/test_integration.py -v`
