-- Simple test grammar insert
INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, is_active, version
) VALUES (
  'bracket',
  'Bracket / Mount',
  'L-bracket, U-bracket, gusset plate, mounting plate with hole patterns',
  ARRAY['bracket', 'mount', 'l-bracket', 'u-bracket', 'gusset', 'plate', 'mounting'],
  ARRAY['Design an L-bracket', 'Create a mounting plate with holes', 'Build a U-bracket'],
  $CODE$
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
        import cadquery as cq
        a = cq.Assembly(name="Bracket")
        left = cq.Workplane("XY").box(s["thickness"], s["width"], s["height"])
        a.add(left, loc=cq.Location(cq.Vector(0,0,0)), color=cq.Color(0.7,0.7,0.7), name="Vertical")
        base = cq.Workplane("XY").box(s["width"], s["thickness"], s["height"])
        a.add(base, loc=cq.Location(cq.Vector(s["width"]/2 - s["thickness"]/2, 0, 0)), color=cq.Color(0.7,0.7,0.7), name="Horizontal")
        return a
$CODE$,
  $CORE$
"""ForgeOS Core — Domain Grammar Base Classes"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
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
            except (TypeError, ValueError): return False, f"{self.name}: expected float, got {type(value).__name__}"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < minimum {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > maximum {self.max_val}"
        elif self.type == "int":
            try: v = int(value)
            except (TypeError, ValueError): return False, f"{self.name}: expected int, got {type(value).__name__}"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < minimum {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > maximum {self.max_val}"
        elif self.type == "enum":
            if self.enum_options and value not in self.enum_options: return False, f"{self.name}: '{value}' not in {self.enum_options}"
        elif self.type == "bool":
            if not isinstance(value, bool): return False, f"{self.name}: expected bool, got {type(value).__name__}"
        elif self.type == "list":
            if not isinstance(value, list): return False, f"{self.name}: expected list, got {type(value).__name__}"
        elif self.type == "dict_list":
            if not isinstance(value, list): return False, f"{self.name}: expected list of dicts, got {type(value).__name__}"
        return True, ""

@dataclass
class Constraint:
    name: str
    description: str
    check_fn: Any
    severity: str = "error"
    def check(self, skeleton):
        return self.check_fn(skeleton)

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
        for constraint in self.constraints():
            ok, msg = constraint.check(skeleton)
            if not ok:
                if constraint.severity == "error":
                    result.errors.append(f"[{constraint.name}] {msg}")
                    result.passed = False
                else:
                    result.warnings.append(f"[{constraint.name}] {msg}")
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
                if spec.default is None and spec.type not in ("dict_list", "list"):
                    result.errors.append(f"Required parameter '{spec.name}' not provided")
                    result.passed = False
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
$CORE$,
  '[{"name":"width","type":"float","unit":"mm","description":"Width","default":50,"min_val":20,"max_val":200},
    {"name":"height","type":"float","unit":"mm","description":"Height","default":50,"min_val":20,"max_val":200},
    {"name":"thickness","type":"float","unit":"mm","description":"Thickness","default":6,"min_val":3,"max_val":20}]'::jsonb,
  '{"width":50,"height":50,"thickness":6}'::jsonb,
  'Simple L-bracket',
  'built_in',
  true,
  1
) ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name;
