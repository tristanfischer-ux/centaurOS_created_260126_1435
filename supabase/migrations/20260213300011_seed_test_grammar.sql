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
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

@dataclass
class ParamSpec:
    name: str; type: str; unit: Optional[str] = None; description: str = ""; default: Any = None; min_val: Any = None; max_val: Any = None; enum_options: Optional[List[str]] = None
    def validate(self, value): return True, ""

@dataclass
class Constraint:
    name: str; description: str; check_fn: Any; severity: str = "error"
    def check(self, s): return self.check_fn(s)

@dataclass
class ValidationResult:
    passed: bool; errors: List[str] = field(default_factory=list); warnings: List[str] = field(default_factory=list); metrics: Dict[str, Any] = field(default_factory=dict)

class DomainGrammar(ABC):
    @property
    @abstractmethod
    def name(self): ...
    @property
    @abstractmethod
    def display_name(self): ...
    @property
    @abstractmethod
    def description(self): ...
    @abstractmethod
    def param_specs(self): ...
    def defaults(self): return {s.name: s.default for s in self.param_specs() if s.default is not None}
    def constraints(self): return []
    @abstractmethod
    def derive_skeleton(self, p): ...
    @abstractmethod
    def build(self, s): ...
    def validate(self, skeleton, assembly):
        r = ValidationResult(passed=True)
        bb = assembly.toCompound().BoundingBox()
        r.metrics["part_count"]=len(assembly.children)
        return r
    def generate(self, params):
        sk=self.derive_skeleton({**self.defaults(),**params})
        return self.build(sk), self.validate(sk, self.build(sk))
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
