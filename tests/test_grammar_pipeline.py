"""
Grammar pipeline integration tests.

Tests that built-in grammars execute successfully on Modal.
Requires: MODAL_CAD_GRAMMAR_ENDPOINT_URL, and optionally Supabase env vars
to fetch grammar data. Skips tests when endpoint URL is not configured.

Run: pytest tests/test_grammar_pipeline.py -v
     Or: MODAL_CAD_GRAMMAR_ENDPOINT_URL=https://... pytest tests/test_grammar_pipeline.py -v
"""

import os
import pytest

try:
    import requests
except ImportError:
    requests = None


def _get_endpoint_url() -> str | None:
    return os.environ.get("MODAL_CAD_GRAMMAR_ENDPOINT_URL") or os.environ.get(
        "MODAL_CAD_ENDPOINT_URL", ""
    ).replace("generate-cad-endpoint", "generate-from-grammar-endpoint") or None


# Minimal core + bracket grammar for self-contained execution test
CORE_LIBRARY = '''"""ForgeOS Core — Domain Grammar Base Classes"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import cadquery as cq

@dataclass
class ParamSpec:
    name: str
    type: str
    unit: Optional[str] = None
    description: str = ""
    default: Any = None
    min_val: Any = None
    max_val: Any = None
    enum_options: Optional[List[str]] = None
    def validate(self, value):
        if value is None: return True, ""
        if self.type == "float":
            try: v = float(value)
            except (TypeError, ValueError): return False, f"{self.name}: expected float"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: below min"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: above max"
        return True, ""

@dataclass
class Constraint:
    name: str
    description: str
    check_fn: Any
    severity: str = "error"
    def check(self, skeleton): return self.check_fn(skeleton)

@dataclass
class ValidationResult:
    passed: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

class DomainGrammar(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...
    @property
    @abstractmethod
    def display_name(self) -> str: ...
    @property
    @abstractmethod
    def description(self) -> str: ...
    @abstractmethod
    def param_specs(self) -> List[ParamSpec]: ...
    def defaults(self) -> Dict[str, Any]:
        return {s.name: s.default for s in self.param_specs() if s.default is not None}
    def constraints(self) -> List[Constraint]:
        return []
    @abstractmethod
    def derive_skeleton(self, params: Dict[str, Any]) -> Dict[str, Any]: ...
    @abstractmethod
    def build(self, skeleton: Dict[str, Any]) -> cq.Assembly: ...
    def validate(self, skeleton, assembly):
        result = ValidationResult(passed=True)
        compound = assembly.toCompound()
        bb = compound.BoundingBox()
        result.metrics["part_count"] = len(assembly.children)
        result.metrics["envelope_mm"] = f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f}"
        return result
    def validate_params(self, params):
        result = ValidationResult(passed=True)
        full_params = {**self.defaults(), **params}
        for spec in self.param_specs():
            if spec.name not in full_params:
                continue
            ok, msg = spec.validate(full_params[spec.name])
            if not ok:
                result.errors.append(msg)
                result.passed = False
        return result
    def generate(self, params):
        full_params = {**self.defaults(), **params}
        param_result = self.validate_params(full_params)
        if not param_result.passed:
            return None, param_result
        skeleton = self.derive_skeleton(full_params)
        assembly = self.build(skeleton)
        result = self.validate(skeleton, assembly)
        return assembly, result
'''

BRACKET_GRAMMAR = '''
import cadquery as cq

class BracketGrammar(DomainGrammar):
    @property
    def name(self): return "bracket"
    @property
    def display_name(self): return "Bracket / Mount"
    @property
    def description(self): return "L-bracket with holes"

    def param_specs(self):
        return [
            ParamSpec("width", "float", "mm", "Width", 50, 20, 200),
            ParamSpec("height", "float", "mm", "Height", 50, 20, 200),
            ParamSpec("thickness", "float", "mm", "Thickness", 6, 3, 20),
        ]

    def defaults(self):
        return {"width": 50, "height": 50, "thickness": 6}

    def derive_skeleton(self, params):
        return dict(params)

    def build(self, s):
        a = cq.Assembly(name="Bracket")
        left = cq.Workplane("XY").box(s["thickness"], s["width"], s["height"])
        a.add(left, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.7, 0.7, 0.7), name="Vertical")
        base = cq.Workplane("XY").box(s["width"], s["thickness"], s["height"])
        a.add(base, loc=cq.Location(cq.Vector(s["width"] / 2 - s["thickness"] / 2, 0, 0)), color=cq.Color(0.7, 0.7, 0.7), name="Horizontal")
        return a
'''


@pytest.mark.skipif(requests is None, reason="requests not installed")
@pytest.mark.skipif(not _get_endpoint_url(), reason="MODAL_CAD_GRAMMAR_ENDPOINT_URL not set")
def test_bracket_grammar_executes_on_modal():
    """Execute bracket grammar on Modal and verify SVG/STEP/STL output."""
    url = _get_endpoint_url()
    payload = {
        "core_code": CORE_LIBRARY,
        "grammar_code": BRACKET_GRAMMAR,
        "params": {"width": 50, "height": 50, "thickness": 6},
        "material_density": 1240,
    }
    resp = requests.post(url, json=payload, timeout=120)
    assert resp.status_code == 200, f"Modal returned {resp.status_code}: {resp.text[:300]}"
    data = resp.json()
    assert data.get("error") is None, f"Modal error: {data.get('error')}"
    has_output = (
        (data.get("step") and len(data["step"]) > 0)
        or (data.get("stl") and len(data["stl"]) > 0)
        or (data.get("svg_iso") and len(data["svg_iso"]) > 0)
    )
    assert has_output, "Modal produced no STEP, STL, or SVG output"


@pytest.mark.skipif(requests is None, reason="requests not installed")
@pytest.mark.skipif(not _get_endpoint_url(), reason="MODAL_CAD_GRAMMAR_ENDPOINT_URL not set")
def test_parameter_extraction_defaults():
    """Verify grammar accepts default parameters and produces output."""
    url = _get_endpoint_url()
    payload = {
        "core_code": CORE_LIBRARY,
        "grammar_code": BRACKET_GRAMMAR,
        "params": {},  # use defaults
        "material_density": 1240,
    }
    resp = requests.post(url, json=payload, timeout=120)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("error") is None
    assert data.get("svg_iso") or data.get("step") or data.get("stl")
