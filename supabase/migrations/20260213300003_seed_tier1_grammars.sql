-- ═══════════════════════════════════════════════════════════════
-- Seed CAD Grammars: Bracket, Heat Sink, Pipe Fitting, Sheet Metal, Pulley
-- ═══════════════════════════════════════════════════════════════
-- Python source code is stored using dollar-quoting to avoid escaping.
-- The core_library_code is the base class framework (grammar.py).
-- The python_code is the domain-specific grammar.

-- ─── Bracket Grammar ────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'bracket',
  'Bracket / Mount',
  'L-brackets, U-brackets, gusset plates, and mounting plates with standardized hole patterns for structural mounting and fixture applications.',
  ARRAY['bracket', 'mount', 'mounting plate', 'l-bracket', 'u-bracket', 'gusset', 'gusset plate', 'structural bracket', 'fixture', 'hardware', 'm mounting', 'corner bracket', ' reinforcement'],
  ARRAY[
    'Design an L-bracket with 4 mounting holes',
    'Create a gusset plate for corner reinforcement',
    'Build a U-bracket for pipe mounting',
    'Make a mounting plate with 2x2 hole pattern',
    'Design a heavy-duty bracket for 50mm rails'
  ],
  $PYBRACKET$
"""
ForgeOS Bracket Grammar — Mounting Brackets and Plates
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

@dataclass
class HolePattern:
    rows: int
    cols: int
    spacing: float
    diameter: float

def _build_l_bracket(width, height, thickness, hole_pattern):
    """Build L-shaped bracket."""
    vert = cq.Workplane("XY").box(thickness, width, height)
    horiz = cq.Workplane("XY").box(width, thickness, height)
    bracket = vert.union(horiz)
    # Cut holes in vertical leg
    for row in range(hole_pattern.rows):
        for col in range(hole_pattern.cols):
            x = (col - (hole_pattern.cols - 1) / 2) * hole_pattern.spacing
            y = (row - (hole_pattern.rows - 1) / 2) * hole_pattern.spacing + width / 2 - thickness - 5
            hole = cq.Workplane("XY").circle(hole_pattern.diameter / 2).extrude(thickness * 3)
            bracket = bracket.cut(hole.translate((x, y, 0)))
    return bracket

def _build_u_bracket(width, height, thickness, hole_pattern):
    """Build U-shaped bracket."""
    left = cq.Workplane("XY").box(thickness, width, height)
    right = cq.Workplane("XY").box(thickness, width, height).translate((width - thickness, 0, 0))
    base = cq.Workplane("XY").box(width, thickness, height)
    bracket = left.union(right).union(base)
    # Cut holes in vertical legs
    for leg_idx, x_off in enumerate([0, width - thickness]):
        for row in range(hole_pattern.rows):
            for col in range(hole_pattern.cols):
                x = x_off + (col - (hole_pattern.cols - 1) / 2) * hole_pattern.spacing
                y = (row - (hole_pattern.rows - 1) / 2) * hole_pattern.spacing
                hole = cq.Workplane("XY").circle(hole_pattern.diameter / 2).extrude(thickness * 3)
                bracket = bracket.cut(hole.translate((x, y, 0)))
    return bracket

def _build_gusset(width, height, thickness, hole_pattern):
    """Build triangular gusset plate."""
    pts = [(0, 0), (width, 0), (width / 2, height)]
    gusset = cq.Workplane("XY").polyline(pts).close().extrude(thickness)
    # Cut holes along bottom edge
    for col in range(min(hole_pattern.cols, 3)):
        x = (col + 1) * width / (hole_pattern.cols + 1)
        hole = cq.Workplane("XY").circle(hole_pattern.diameter / 2).extrude(thickness * 3)
        gusset = gusset.cut(hole.translate((x, thickness + 2, 0)))
    return gusset

def _build_plate(width, height, thickness, hole_pattern):
    """Build rectangular mounting plate."""
    plate = cq.Workplane("XY").box(width, height, thickness)
    # Cut grid of holes
    for row in range(hole_pattern.rows):
        for col in range(hole_pattern.cols):
            x = (col - (hole_pattern.cols - 1) / 2) * hole_pattern.spacing
            y = (row - (hole_pattern.rows - 1) / 2) * hole_pattern.spacing
            hole = cq.Workplane("XY").circle(hole_pattern.diameter / 2).extrude(thickness * 3)
            plate = plate.cut(hole.translate((x, y, 0)))
    return plate

def _check_min_hole_spacing(s):
    """Hole spacing should be at least 2x hole diameter."""
    pattern = s.get("hole_pattern_obj")
    if pattern and pattern.spacing < pattern.diameter * 2:
        return False, f"Hole spacing {pattern.spacing:.1f}mm < 2x diameter {pattern.diameter * 2:.1f}mm"
    return True, ""

def _check_min_edge_distance(s):
    """Hole center should be at least 1.5x diameter from edge."""
    pattern = s.get("hole_pattern_obj")
    if not pattern:
        return True, ""
    min_dist = pattern.diameter * 1.5
    if s["bracket_type"] == "l_bracket":
        if pattern.spacing < min_dist:
            return False, f"Hole spacing too close to edge"
    return True, ""

class BracketGrammar(DomainGrammar):
    @property
    def name(self): return "bracket"
    @property
    def display_name(self): return "Bracket / Mount"
    @property
    def description(self): return "L-brackets, U-brackets, gusset plates, and mounting plates with hole patterns"

    def param_specs(self):
        return [
            ParamSpec("bracket_type", "enum", None, "Type of bracket", "l_bracket", enum_options=["l_bracket", "u_bracket", "gusset", "plate"]),
            ParamSpec("width", "float", "mm", "Bracket width", 50, 20, 200),
            ParamSpec("height", "float", "mm", "Bracket height", 50, 20, 200),
            ParamSpec("thickness", "float", "mm", "Material thickness", 6, 3, 20),
            ParamSpec("hole_diameter", "float", "mm", "Mounting hole diameter", 6, 3, 20),
            ParamSpec("hole_count_x", "int", None, "Holes in X direction", 2, 1, 5),
            ParamSpec("hole_count_y", "int", None, "Holes in Y direction", 2, 1, 5),
            ParamSpec("hole_spacing", "float", "mm", "Hole pattern spacing", 15, 10, 50),
        ]

    def defaults(self):
        return {
            "bracket_type": "l_bracket", "width": 50, "height": 50, "thickness": 6,
            "hole_diameter": 6, "hole_count_x": 2, "hole_count_y": 2, "hole_spacing": 15,
        }

    def constraints(self):
        return [
            Constraint("min_hole_spacing", "Hole spacing >= 2x diameter",
                lambda s: _check_min_hole_spacing(s), severity="error"),
            Constraint("min_edge_distance", "Hole center >= 1.5x diameter from edge",
                lambda s: _check_min_edge_distance(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        s["hole_pattern_obj"] = HolePattern(
            rows=s["hole_count_y"],
            cols=s["hole_count_x"],
            spacing=s["hole_spacing"],
            diameter=s["hole_diameter"]
        )
        # Validate and clamp hole pattern to fit within dimensions
        total_hole_width = (s["hole_count_x"] - 1) * s["hole_spacing"]
        total_hole_height = (s["hole_count_y"] - 1) * s["hole_spacing"]
        if s["bracket_type"] == "l_bracket":
            s["hole_spacing"] = min(s["hole_spacing"], (s["width"] - s["thickness"]) * 0.8)
        elif s["bracket_type"] == "plate":
            s["hole_spacing"] = min(s["hole_spacing"], min(s["width"], s["height"]) * 0.8)
        return s

    def build(self, skeleton):
        s = skeleton
        bracket_type = s["bracket_type"]
        width = s["width"]
        height = s["height"]
        thickness = s["thickness"]
        hole_pattern = s["hole_pattern_obj"]
        
        assy = cq.Assembly(name="ForgeOS_Bracket")
        
        if bracket_type == "l_bracket":
            part = _build_l_bracket(width, height, thickness, hole_pattern)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name="LBracket")
        elif bracket_type == "u_bracket":
            part = _build_u_bracket(width, height, thickness, hole_pattern)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name="UBracket")
        elif bracket_type == "gusset":
            part = _build_gusset(width, height, thickness, hole_pattern)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name="GussetPlate")
        else:  # plate
            part = _build_plate(width, height, thickness, hole_pattern)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name="MountingPlate")
        
        return assy
$PYBRACKET$,

  -- Core library (grammar.py base classes)
  $PYCORE_BRACKET$
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
            for i, item in enumerate(value):
                if not isinstance(item, dict): return False, f"{self.name}[{i}]: expected dict, got {type(item).__name__}"
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
    def display_name(self): return ""
    @property
    @abstractmethod
    def description(self): return ""
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
$PYCORE_BRACKET$,

  -- Param specs as JSON
  '[
    {"name":"bracket_type","type":"enum","unit":null,"description":"Type of bracket","default":"l_bracket","enum_options":["l_bracket","u_bracket","gusset","plate"]},
    {"name":"width","type":"float","unit":"mm","description":"Bracket width","default":50,"min_val":20,"max_val":200},
    {"name":"height","type":"float","unit":"mm","description":"Bracket height","default":50,"min_val":20,"max_val":200},
    {"name":"thickness","type":"float","unit":"mm","description":"Material thickness","default":6,"min_val":3,"max_val":20},
    {"name":"hole_diameter","type":"float","unit":"mm","description":"Mounting hole diameter","default":6,"min_val":3,"max_val":20},
    {"name":"hole_count_x","type":"int","unit":null,"description":"Holes in X direction","default":2,"min_val":1,"max_val":5},
    {"name":"hole_count_y","type":"int","unit":null,"description":"Holes in Y direction","default":2,"min_val":1,"max_val":5},
    {"name":"hole_spacing","type":"float","unit":"mm","description":"Hole pattern spacing","default":15,"min_val":10,"max_val":50}
  ]'::jsonb,

  -- Defaults as JSON
  '{"bracket_type":"l_bracket","width":50,"height":50,"thickness":6,"hole_diameter":6,"hole_count_x":2,"hole_count_y":2,"hole_spacing":15}'::jsonb,

  'Hole spacing >= 2x diameter. Hole center >= 1.5x diameter from edge.',
  'built_in',
  1
) ON CONFLICT (name) DO UPDATE SET
  python_code = EXCLUDED.python_code,
  core_library_code = EXCLUDED.core_library_code,
  param_specs = EXCLUDED.param_specs,
  defaults = EXCLUDED.defaults,
  domain_keywords = EXCLUDED.domain_keywords,
  example_prompts = EXCLUDED.example_prompts,
  updated_at = NOW();


-- ─── Heat Sink Grammar ────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'heat_sink',
  'Heat Sink',
  'Aluminium extrusion heat sinks for electronic components. Configurable fin count, base thickness, and IC footprints (TO-220, TO-247, QFN, etc.).',
  ARRAY['heat sink', 'heatsink', 'thermal', 'electronics cooling', 'aluminum extrusion', 'to220', 'to247', 'to263', 'qfn', 'ic mounting', 'thermal management', 'active cooling', 'passive cooling', 'finned heatsink'],
  ARRAY[
    'Design a heat sink for TO-220 package',
    'Create a 12-fin heat sink for TO-247',
    'Build a QFN heat sink with 4x4 pattern',
    'Make a 25mm tall heat sink with 16 fins',
    'Design an extruded heatsink for a power transistor'
  ],
  $PYHEATSINK$
"""
ForgeOS Heat Sink Grammar — Electronics Cooling
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# IC footprint dimensions (mm)
IC_FOOTPRINTS = {
    "to220": {"width": 10.16, "length": 15.24, "tab_width": 12.7, "pin_pitch": 2.54},
    "to247": {"width": 15.42, "length": 25.4, "tab_width": 20.32, "pin_pitch": 2.54},
    "to263": {"width": 10.16, "length": 15.24, "tab_width": 12.7, "pin_pitch": 2.54},
    "qfn": {"width": 5.0, "length": 5.0, "tab_width": 0, "pin_pitch": 0.5},
}

# Hole pattern dimensions (mm)
HOLE_PATTERNS = {
    "none": {"rows": 0, "cols": 0, "spacing": 0},
    "2x2": {"rows": 2, "cols": 2, "spacing": 15},
    "3x3": {"rows": 3, "cols": 3, "spacing": 12},
    "4x4": {"rows": 4, "cols": 4, "spacing": 10},
}

def _build_extruded_heatsink(length, width, height, fin_count, fin_thickness, base_thickness):
    """Build extruded fin heat sink."""
    # Base plate
    base = cq.Workplane("XY").box(length, width, base_thickness)
    
    # Build fins
    total_fin_space = width - fin_thickness * fin_count
    fin_spacing = total_fin_space / (fin_count - 1) if fin_count > 1 else 0
    
    fin_height = height - base_thickness
    for i in range(fin_count):
        y = -width / 2 + fin_thickness / 2 + i * (fin_thickness + fin_spacing)
        fin = cq.Workplane("XY").box(length, fin_thickness, fin_height)
        fin = fin.translate((0, y, base_thickness / 2 + fin_height / 2))
        base = base.union(fin)
    
    return base

def _add_mounting_holes(heatsink, length, width, thickness, hole_pattern):
    """Add mounting holes to heat sink."""
    for row in range(hole_pattern["rows"]):
        for col in range(hole_pattern["cols"]):
            x = (col - (hole_pattern["cols"] - 1) / 2) * hole_pattern["spacing"]
            y = (row - (hole_pattern["rows"] - 1) / 2) * hole_pattern["spacing"]
            hole = cq.Workplane("XY").circle(3.2 / 2).extrude(thickness * 3)
            heatsink = heatsink.cut(hole.translate((x, y, 0)))
    return heatsink

def _add_ic_cutout(heatsink, ic_spec, length, width, base_thickness):
    """Add cutout for IC package."""
    if ic_spec["tab_width"] > 0:
        # Create pocket for TO-style package
        pocket = cq.Workplane("XY").box(
            ic_spec["length"] + 2,
            ic_spec["tab_width"] + 2,
            base_thickness + 1
        )
        cx = 0
        cy = 0
        heatsink = heatsink.cut(pocket.translate((cx, cy, 0)))
    return heatsink

def _check_fin_aspect_ratio(s):
    """Fin height should be reasonable relative to thickness."""
    fin_height = s["height"] - s["base_thickness"]
    if fin_height / s["fin_thickness"] > 20:
        return False, f"Fin aspect ratio {fin_height / s['fin_thickness']:.1f} > 20:1 (may be too fragile)"
    return True, ""

def _check_thermal_mass(s):
    """Base should be thick enough for thermal mass."""
    if s["base_thickness"] < 2:
        return False, f"Base thickness {s['base_thickness']}mm < 2mm (insufficient thermal mass)"
    return True, ""

class HeatSinkGrammar(DomainGrammar):
    @property
    def name(self): return "heat_sink"
    @property
    def display_name(self): return "Heat Sink"
    @property
    def description(self): return "Aluminium extrusion heat sinks for electronics cooling"

    def param_specs(self):
        return [
            ParamSpec("length", "float", "mm", "Heat sink length", 50, 25, 150),
            ParamSpec("width", "float", "mm", "Heat sink width", 50, 25, 150),
            ParamSpec("height", "float", "mm", "Overall height including base", 25, 10, 80),
            ParamSpec("fin_count", "int", None, "Number of fins", 12, 4, 30),
            ParamSpec("fin_thickness", "float", "mm", "Individual fin thickness", 1.5, 0.5, 5),
            ParamSpec("base_thickness", "float", "mm", "Base plate thickness", 3, 1.5, 10),
            ParamSpec("hole_pattern", "enum", None, "Mounting hole pattern", "2x2", enum_options=["none", "2x2", "3x3", "4x4"]),
            ParamSpec("ic_footprint", "enum", None, "IC package footprint", "to220", enum_options=["to220", "to247", "to263", "qfn"]),
        ]

    def defaults(self):
        return {
            "length": 50, "width": 50, "height": 25, "fin_count": 12,
            "fin_thickness": 1.5, "base_thickness": 3, "hole_pattern": "2x2", "ic_footprint": "to220",
        }

    def constraints(self):
        return [
            Constraint("fin_aspect_ratio", "Fin aspect ratio should be < 20:1",
                lambda s: _check_fin_aspect_ratio(s), severity="warning"),
            Constraint("thermal_mass", "Base thickness >= 2mm for thermal mass",
                lambda s: _check_thermal_mass(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        s["ic_spec"] = IC_FOOTPRINTS[s["ic_footprint"]]
        s["hole_pattern_spec"] = HOLE_PATTERNS[s["hole_pattern"]]
        s["fin_height"] = s["height"] - s["base_thickness"]
        return s

    def build(self, skeleton):
        s = skeleton
        length = s["length"]
        width = s["width"]
        height = s["height"]
        fin_count = s["fin_count"]
        fin_thickness = s["fin_thickness"]
        base_thickness = s["base_thickness"]
        
        assy = cq.Assembly(name="ForgeOS_HeatSink")
        
        heatsink = _build_extruded_heatsink(length, width, height, fin_count, fin_thickness, base_thickness)
        
        # Add mounting holes if specified
        if s["hole_pattern"] != "none":
            heatsink = _add_mounting_holes(heatsink, length, width, base_thickness, s["hole_pattern_spec"])
        
        # Add IC cutout if applicable
        heatsink = _add_ic_cutout(heatsink, s["ic_spec"], length, width, base_thickness)
        
        assy.add(heatsink, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.7, 0.7, 0.75), name="HeatSinkBody")
        
        return assy
$PYHEATSINK$,

  -- Core library
  $PYCORE_HEATSINK$
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
            for i, item in enumerate(value):
                if not isinstance(item, dict): return False, f"{self.name}[{i}]: expected dict, got {type(item).__name__}"
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
    def display_name(self): return ""
    @property
    @abstractmethod
    def description(self): return ""
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
$PYCORE_HEATSINK$,

  -- Param specs as JSON
  '[
    {"name":"length","type":"float","unit":"mm","description":"Heat sink length","default":50,"min_val":25,"max_val":150},
    {"name":"width","type":"float","unit":"mm","description":"Heat sink width","default":50,"min_val":25,"max_val":150},
    {"name":"height","type":"float","unit":"mm","description":"Overall height including base","default":25,"min_val":10,"max_val":80},
    {"name":"fin_count","type":"int","unit":null,"description":"Number of fins","default":12,"min_val":4,"max_val":30},
    {"name":"fin_thickness","type":"float","unit":"mm","description":"Individual fin thickness","default":1.5,"min_val":0.5,"max_val":5},
    {"name":"base_thickness","type":"float","unit":"mm","description":"Base plate thickness","default":3,"min_val":1.5,"max_val":10},
    {"name":"hole_pattern","type":"enum","unit":null,"description":"Mounting hole pattern","default":"2x2","enum_options":["none","2x2","3x3","4x4"]},
    {"name":"ic_footprint","type":"enum","unit":null,"description":"IC package footprint","default":"to220","enum_options":["to220","to247","to263","qfn"]}
  ]'::jsonb,

  -- Defaults as JSON
  '{"length":50,"width":50,"height":25,"fin_count":12,"fin_thickness":1.5,"base_thickness":3,"hole_pattern":"2x2","ic_footprint":"to220"}'::jsonb,

  'Fin aspect ratio < 20:1. Base thickness >= 2mm for thermal mass.',
  'built_in',
  1
) ON CONFLICT (name) DO UPDATE SET
  python_code = EXCLUDED.python_code,
  core_library_code = EXCLUDED.core_library_code,
  param_specs = EXCLUDED.param_specs,
  defaults = EXCLUDED.defaults,
  domain_keywords = EXCLUDED.domain_keywords,
  example_prompts = EXCLUDED.example_prompts,
  updated_at = NOW();


-- ─── Pipe Fitting Grammar ───────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'pipe_fitting',
  'Pipe Flange / Fitting',
  'ANSI B16.5 pipe flanges and fittings. Supports flanges, elbows, tees, and reducers with pressure classes 150/300/600.',
  ARRAY['pipe', 'flange', 'pipe fitting', 'elbow', 'tee', 'reducer', 'ansi', 'pressure vessel', 'piping', 'class 150', 'class 300', 'npt', 'butt weld', 'socket weld', 'pipe support'],
  ARRAY[
    'Design a 2-inch Class 150 flange',
    'Create a 90-degree elbow for 1.5-inch pipe',
    'Build a reducing tee for 2x1 inch',
    'Make a Class 300 pipe flange',
    'Design a pipe reducer from 3 to 2 inch'
  ],
  $PYPIPEFITTING$
"""
ForgeOS Pipe Fitting Grammar — ANSI B16.5 Flanges and Fittings
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# ANSI B16.5 pipe dimensions (inches -> mm)
NOMINAL_SIZES = {
    "1/2": 15, "3/4": 20, "1": 25, "1.5": 40, "2": 50, "3": 80, "4": 100,
    "6": 150, "8": 200, "10": 250, "12": 300,
}

# OD (outside diameter) in mm for each nominal size
PIPE_OD = {
    "1/2": 21.3, "3/4": 26.7, "1": 33.4, "1.5": 48.3, "2": 60.3,
    "3": 88.9, "4": 114.3, "6": 168.3, "8": 219.1, "10": 273.0, "12": 323.8,
}

# ID (inside diameter) in mm (Schedule 40)
PIPE_ID = {
    "1/2": 15.8, "3/4": 20.9, "1": 27.1, "1.5": 40.9, "2": 52.5,
    "3": 77.9, "4": 102.3, "6": 154.1, "8": 202.7, "10": 254.5, "12": 303.2,
}

# Flange OD and bolt circle for each nominal size and pressure class
FLANGE_DATA = {
    ("1/2", "class_150"): {"od": 89, "bc": 60, "bolt_d": 13, "bolt_count": 4, "thk": 11},
    ("3/4", "class_150"): {"od": 98, "bc": 70, "bolt_d": 13, "bolt_count": 4, "thk": 13},
    ("1", "class_150"): {"od": 108, "bc": 79, "bolt_d": 13, "bolt_count": 4, "thk": 14},
    ("1.5", "class_150"): {"od": 127, "bc": 98, "bolt_d": 13, "bolt_count": 4, "thk": 17},
    ("2", "class_150"): {"od": 152, "bc": 121, "bolt_d": 19, "bolt_count": 4, "thk": 19},
    ("3", "class_150"): {"od": 191, "bc": 152, "bolt_d": 19, "bolt_count": 4, "thk": 24},
    ("4", "class_150"): {"od": 229, "bc": 191, "bolt_d": 19, "bolt_count": 8, "thk": 24},
    ("6", "class_150"): {"od": 279, "bc": 241, "bolt_d": 22, "bolt_count": 8, "thk": 26},
    ("8", "class_150"): {"od": 343, "bc": 298, "bolt_d": 22, "bolt_count": 8, "thk": 27},
    ("10", "class_150"): {"od": 406, "bc": 362, "bolt_d": 25, "bolt_count": 12, "thk": 29},
    ("12", "class_150"): {"od": 483, "bc": 432, "bolt_d": 25, "bolt_count": 12, "thk": 32},
    ("1/2", "class_300"): {"od": 95, "bc": 67, "bolt_d": 13, "bolt_count": 4, "thk": 14},
    ("1", "class_300"): {"od": 124, "bc": 89, "bolt_d": 16, "bolt_count": 4, "thk": 18},
    ("1.5", "class_300"): {"od": 156, "bc": 114, "bolt_d": 22, "bolt_count": 4, "thk": 22},
    ("2", "class_300"): {"od": 165, "bc": 127, "bolt_d": 19, "bolt_count": 8, "thk": 22},
    ("3", "class_300"): {"od": 210, "bc": 168, "bolt_d": 22, "bolt_count": 8, "thk": 29},
    ("4", "class_300"): {"od": 254, "bc": 200, "bolt_d": 25, "bolt_count": 8, "thk": 32},
    ("6", "class_300"): {"od": 318, "bc": 270, "bolt_d": 22, "bolt_count": 12, "thk": 37},
    ("8", "class_300"): {"od": 381, "bc": 330, "bolt_d": 25, "bolt_count": 12, "thk": 43},
    ("10", "class_300"): {"od": 444, "bc": 389, "bolt_d": 29, "bolt_count": 16, "thk": 51},
    ("12", "class_300"): {"od": 521, "bc": 456, "bolt_d": 32, "bolt_count": 16, "thk": 56},
    ("1/2", "class_600"): {"od": 95, "bc": 67, "bolt_d": 13, "bolt_count": 4, "thk": 14},
    ("1", "class_600"): {"od": 124, "bc": 89, "bolt_d": 16, "bolt_count": 4, "thk": 18},
    ("1.5", "class_600"): {"od": 156, "bc": 114, "bolt_d": 22, "bolt_count": 4, "thk": 22},
    ("2", "class_600"): {"od": 165, "bc": 127, "bolt_d": 19, "bolt_count": 8, "thk": 22},
    ("3", "class_600"): {"od": 210, "bc": 168, "bolt_d": 22, "bolt_count": 8, "thk": 29},
    ("4", "class_600"): {"od": 275, "bc": 216, "bolt_d": 28, "bolt_count": 8, "thk": 38},
}

# Default for sizes not explicitly defined
DEFAULT_FLANGE = {"od": 100, "bc": 80, "bolt_d": 16, "bolt_count": 4, "thk": 15}

def _build_flange(nominal_diameter, pressure_class):
    """Build a pipe flange."""
    key = (nominal_diameter, pressure_class)
    fd = FLANGE_DATA.get(key, DEFAULT_FLANGE)
    
    # Main flange face
    flange = cq.Workplane("XY").circle(fd["od"] / 2).extrude(fd["thk"])
    
    # Bolt holes
    for i in range(fd["bolt_count"]):
        angle = (2 * math.pi * i) / fd["bolt_count"]
        bx = (fd["bc"] / 2) * math.cos(angle)
        by = (fd["bc"] / 2) * math.sin(angle)
        hole = cq.Workplane("XY").circle(fd["bolt_d"] / 2).extrude(fd["thk"] * 2)
        flange = flange.cut(hole.translate((bx, by, 0)))
    
    # Pipe stub (short length)
    pipe_od = PIPE_OD.get(nominal_diameter, 50)
    pipe = cq.Workplane("XY").circle(pipe_od / 2).extrude(30)
    flange = flange.union(pipe.translate((0, 0, -30)))
    
    return flange

def _build_elbow(nominal_diameter, angle_deg):
    """Build a pipe elbow."""
    pipe_od = PIPE_OD.get(nominal_diameter, 50)
    radius = pipe_od * 1.5
    
    # Create elbow using sweep
    path = cq.Workplane("XZ")
    path = path.moveTo(0, 0).radiusArc((radius, radius), radius)
    if angle_deg != 90:
        # Adjust for different angles
        path = cq.Workplane("XZ").moveTo(0, 0)
        rad = math.radians(angle_deg)
        path = path.lineTo(radius * math.sin(rad), radius * (1 - math.cos(rad)))
    
    elbow = cq.Workplane("XY").circle(pipe_od / 2).sweep(path)
    return elbow

def _build_tee(nominal_diameter):
    """Build a pipe tee."""
    pipe_od = PIPE_OD.get(nominal_diameter, 50)
    
    # Main run
    run = cq.Workplane("XY").circle(pipe_od / 2).extrude(100)
    
    # Branch
    branch = cq.Workplane("XY").circle(pipe_od / 2).extrude(50)
    branch = branch.rotate((0, 0, 0), (1, 0, 0), 90)
    branch = branch.translate((0, 50, 0))
    
    tee = run.union(branch)
    return tee

def _build_reducer(nominal_diameter_large, nominal_diameter_small):
    """Build a pipe reducer."""
    od_large = PIPE_OD.get(nominal_diameter_large, 60)
    od_small = PIPE_OD.get(nominal_diameter_small, 40)
    
    # Concentric reducer
    reducer = cq.Workplane("XY").circle(od_large / 2).extrude(40)
    
    # Taper to smaller diameter
    taper = cq.Workplane("XY").circle(od_small / 2).extrude(40)
    reducer = reducer.union(taper.translate((0, 0, 40)))
    
    return reducer

def _check_bolt_pattern_fit(s):
    """Bolt holes should fit within flange."""
    fd = s.get("flange_data")
    if not fd:
        return True, ""
    if fd["bc"] < fd["bolt_d"] * 1.5:
        return False, f"Bolt circle {fd['bc']}mm too small for {fd['bolt_count']}x M{fd['bolt_d']} bolts"
    return True, ""

def _check_reducer_ratio(s):
    """Reducer should not reduce by more than 2:1."""
    if s["fitting_type"] == "reducer":
        large = s["nominal_diameter_large"]
        small = s["nominal_diameter_small"]
        if large in PIPE_OD and small in PIPE_OD:
            ratio = PIPE_OD[large] / PIPE_OD[small]
            if ratio > 2.5:
                return False, f"Reducer ratio {ratio:.1f}:1 > 2.5:1 (may cause flow issues)"
    return True, ""

class PipeFittingGrammar(DomainGrammar):
    @property
    def name(self): return "pipe_fitting"
    @property
    def display_name(self): return "Pipe Flange / Fitting"
    @property
    def description(self): return "ANSI B16.5 pipe flanges and fittings"

    def param_specs(self):
        return [
            ParamSpec("nominal_diameter", "enum", None, "Nominal pipe diameter", "2", enum_options=["1/2", "3/4", "1", "1.5", "2", "3", "4", "6", "8", "10", "12"]),
            ParamSpec("nominal_diameter_large", "enum", None, "Large end diameter (reducer/tee)", "2", enum_options=["1/2", "3/4", "1", "1.5", "2", "3", "4", "6", "8", "10", "12"]),
            ParamSpec("nominal_diameter_small", "enum", None, "Small end diameter (reducer)", "1", enum_options=["1/2", "3/4", "1", "1.5", "2", "3", "4", "6", "8", "10", "12"]),
            ParamSpec("fitting_type", "enum", None, "Type of fitting", "flange", enum_options=["flange", "elbow_90", "elbow_45", "tee", "reducer"]),
            ParamSpec("pressure_class", "enum", None, "Pressure class (ANSI)", "class_150", enum_options=["class_150", "class_300", "class_600"]),
        ]

    def defaults(self):
        return {
            "nominal_diameter": "2", "nominal_diameter_large": "2", "nominal_diameter_small": "1",
            "fitting_type": "flange", "pressure_class": "class_150",
        }

    def constraints(self):
        return [
            Constraint("bolt_pattern_fit", "Bolt circle must fit flange",
                lambda s: _check_bolt_pattern_fit(s), severity="error"),
            Constraint("reducer_ratio", "Reducer ratio should be < 2.5:1",
                lambda s: _check_reducer_ratio(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        key = (s["nominal_diameter"], s["pressure_class"])
        s["flange_data"] = FLANGE_DATA.get(key)
        s["pipe_od"] = PIPE_OD.get(s["nominal_diameter"], 50)
        s["pipe_id"] = PIPE_ID.get(s["nominal_diameter"], 40)
        return s

    def build(self, skeleton):
        s = skeleton
        fitting_type = s["fitting_type"]
        nominal_diameter = s["nominal_diameter"]
        
        assy = cq.Assembly(name="ForgeOS_PipeFitting")
        
        if fitting_type == "flange":
            part = _build_flange(nominal_diameter, s["pressure_class"])
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name="Flange")
        elif fitting_type == "elbow_90":
            part = _build_elbow(nominal_diameter, 90)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name="Elbow90")
        elif fitting_type == "elbow_45":
            part = _build_elbow(nominal_diameter, 45)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name="Elbow45")
        elif fitting_type == "tee":
            part = _build_tee(nominal_diameter)
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name="Tee")
        elif fitting_type == "reducer":
            part = _build_reducer(s["nominal_diameter_large"], s["nominal_diameter_small"])
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name="Reducer")
        
        return assy
$PYPIPEFITTING$,

  -- Core library
  $PYCORE_PIPEFITTING$
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
            for i, item in enumerate(value):
                if not isinstance(item, dict): return False, f"{self.name}[{i}]: expected dict, got {type(item).__name__}"
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
    def display_name(self): return ""
    @property
    @abstractmethod
    def description(self): return ""
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
$PYCORE_PIPEFITTING$,

  -- Param specs as JSON
  '[
    {"name":"nominal_diameter","type":"enum","unit":null,"description":"Nominal pipe diameter","default":"2","enum_options":["1/2","3/4","1","1.5","2","3","4","6","8","10","12"]},
    {"name":"nominal_diameter_large","type":"enum","unit":null,"description":"Large end diameter (reducer/tee)","default":"2","enum_options":["1/2","3/4","1","1.5","2","3","4","6","8","10","12"]},
    {"name":"nominal_diameter_small","type":"enum","unit":null,"description":"Small end diameter (reducer)","default":"1","enum_options":["1/2","3/4","1","1.5","2","3","4","6","8","10","12"]},
    {"name":"fitting_type","type":"enum","unit":null,"description":"Type of fitting","default":"flange","enum_options":["flange","elbow_90","elbow_45","tee","reducer"]},
    {"name":"pressure_class","type":"enum","unit":null,"description":"Pressure class (ANSI)","default":"class_150","enum_options":["class_150","class_300","class_600"]}
  ]'::jsonb,

  -- Defaults as JSON
  '{"nominal_diameter":"2","nominal_diameter_large":"2","nominal_diameter_small":"1","fitting_type":"flange","pressure_class":"class_150"}'::jsonb,

  'Bolt pattern must fit flange. Reducer ratio < 2.5:1.',
  'built_in',
  1
) ON CONFLICT (name) DO UPDATE SET
  python_code = EXCLUDED.python_code,
  core_library_code = EXCLUDED.core_library_code,
  param_specs = EXCLUDED.param_specs,
  defaults = EXCLUDED.defaults,
  domain_keywords = EXCLUDED.domain_keywords,
  example_prompts = EXCLUDED.example_prompts,
  updated_at = NOW();


-- ─── Sheet Metal Grammar ───────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'sheet_metal',
  'Sheet Metal Part',
  'Sheet metal parts with bends, flanges, and tabs. Configurable material thickness, bend radius, and bend angle. Flat pattern generation.',
  ARRAY['sheet metal', 'bent metal', 'bend', 'flange', 'tab', 'fabrication', 'laser cut', 'cnc brake', 'metal fabrication', 'folding', 'gauge', 'gusset', 'bracket', 'enclosure'],
  ARRAY[
    'Create a 200x100mm sheet metal part with 2 bends',
    'Design a sheet metal enclosure with flanges',
    'Build a bracket with 90-degree bends',
    'Make a sheet metal plate with tabs',
    'Design a 1.5mm thick metal part with 4 flanges'
  ],
  $PYSHEETMETAL$
"""
ForgeOS Sheet Metal Grammar — Bent Metal Parts
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _build_sheet_metal_blank(length, width, thickness):
    """Create flat blank."""
    return cq.Workplane("XY").box(length, width, thickness)

def _add_bends(blank, bends, bend_radius, bend_angle, thickness):
    """Add bends to flat blank."""
    for bend in bends:
        # Each bend: {"edge": "left"|"right"|"top"|"bottom", "angle": degrees}
        edge = bend.get("edge", "right")
        angle = bend.get("angle", bend_angle)
        
        if edge == "right":
            # Bend up along right edge
            flange_h = bend.get("height", 20)
            flange = cq.Workplane("XY").box(thickness, flange_h, thickness)
            flange = flange.rotate((0, 0, 0), (1, 0, 0), angle)
            flange = flange.translate((width - thickness/2, 0, -flange_h + thickness + bend_radius))
            blank = blank.union(flange)
        elif edge == "left":
            flange_h = bend.get("height", 20)
            flange = cq.Workplane("XY").box(thickness, flange_h, thickness)
            flange = flange.rotate((0, 0, 0), (1, 0, 0), angle)
            flange = flange.translate((-width + thickness/2, 0, -flange_h + thickness + bend_radius))
            blank = blank.union(flange)
        elif edge == "top":
            flange_h = bend.get("height", 20)
            flange = cq.Workplane("XY").box(flange_h, thickness, thickness)
            flange = flange.rotate((0, 0, 0), (0, 1, 0), -angle)
            flange = flange.translate((0, thickness/2, -flange_h + thickness + bend_radius))
            blank = blank.union(flange)
        elif edge == "bottom":
            flange_h = bend.get("height", 20)
            flange = cq.Workplane("XY").box(flange_h, thickness, thickness)
            flange = flange.rotate((0, 0, 0), (0, 1, 0), -angle)
            flange = flange.translate((0, -thickness/2, -flange_h + thickness + bend_radius))
            blank = blank.union(flange)
    
    return blank

def _add_tabs(blank, tabs, thickness):
    """Add mounting tabs to sheet metal part."""
    for tab in tabs:
        width = tab.get("width", 20)
        height = tab.get("height", 15)
        edge = tab.get("edge", "right")
        position = tab.get("position", 0.5)  # 0-1 along edge
        
        if edge == "right":
            x = 0
            y = position * 1.0 - 0.5
            tab_obj = cq.Workplane("XY").box(width, height, thickness)
            tab_obj = tab_obj.translate((x, y * 100, 0))
            blank = blank.union(tab_obj)
        elif edge == "left":
            x = -width
            y = position * 1.0 - 0.5
            tab_obj = cq.Workplane("XY").box(width, height, thickness)
            tab_obj = tab_obj.translate((x, y * 100, 0))
            blank = blank.union(tab_obj)
        elif edge == "top":
            x = position * 1.0 - 0.5
            y = 0
            tab_obj = cq.Workplane("XY").box(height, width, thickness)
            tab_obj = tab_obj.rotate((0, 0, 0), (0, 0, 1), 90)
            tab_obj = tab_obj.translate((x * 100, y, 0))
            blank = blank.union(tab_obj)
        elif edge == "bottom":
            x = position * 1.0 - 0.5
            y = -width
            tab_obj = cq.Workplane("XY").box(height, width, thickness)
            tab_obj = tab_obj.rotate((0, 0, 0), (0, 0, 1), 90)
            tab_obj = tab_obj.translate((x * 100, y, 0))
            blank = blank.union(tab_obj)
    
    return blank

def _add_flanges(blank, flanges, thickness):
    """Add edge flanges."""
    for flange in flanges:
        edge = flange.get("edge", "right")
        width = flange.get("width", 20)
        
        if edge == "right":
            flange_part = cq.Workplane("XY").box(width, thickness, thickness)
            flange_part = flange_part.translate((width/2, 0, 0))
            blank = blank.union(flange_part)
        elif edge == "left":
            flange_part = cq.Workplane("XY").box(width, thickness, thickness)
            flange_part = flange_part.translate((-width/2, 0, 0))
            blank = blank.union(flange_part)
        elif edge == "top":
            flange_part = cq.Workplane("XY").box(thickness, width, thickness)
            flange_part = flange_part.translate((0, width/2, 0))
            blank = blank.union(flange_part)
        elif edge == "bottom":
            flange_part = cq.Workplane("XY").box(thickness, width, thickness)
            flange_part = flange_part.translate((0, -width/2, 0))
            blank = blank.union(flange_part)
    
    return blank

def _check_bend_compression(s):
    """Bend radius should not cause material compression failure."""
    thickness = s["material_thickness"]
    bend_r = s["bend_radius"]
    if bend_r < thickness * 0.5:
        return False, f"Bend radius {bend_r}mm < 0.5x thickness {thickness}mm (risk of cracking)"
    if bend_r > thickness * 6:
        return False, f"Bend radius {bend_r}mm > 6x thickness {thickness}mm (may not bend cleanly)"
    return True, ""

def _check_k_factor(s):
    """K-factor should be in reasonable range."""
    k = s.get("k_factor", 0.5)
    if k < 0.33 or k > 0.5:
        return False, f"K-factor {k} outside typical range 0.33-0.50"
    return True, ""

class SheetMetalGrammar(DomainGrammar):
    @property
    def name(self): return "sheet_metal"
    @property
    def display_name(self): return "Sheet Metal Part"
    @property
    def description(self): return "Sheet metal parts with bends and flanges"

    def param_specs(self):
        return [
            ParamSpec("length", "float", "mm", "Part length (X)", 200, 50, 1000),
            ParamSpec("width", "float", "mm", "Part width (Y)", 100, 50, 500),
            ParamSpec("material_thickness", "float", "mm", "Material thickness (gauge)", 1.5, 0.5, 6.0),
            ParamSpec("bend_radius", "float", "mm", "Bend radius (typically 1-2x thickness)", 2.25, 0.5, 10),
            ParamSpec("bend_angle", "float", "degrees", "Default bend angle", 90, 30, 150),
            ParamSpec("tab_count", "int", None, "Number of mounting tabs", 2, 0, 8),
            ParamSpec("tab_width", "float", "mm", "Tab width", 15, 8, 40),
            ParamSpec("flange_width", "float", "mm", "Edge flange width", 15, 5, 50),
        ]

    def defaults(self):
        return {
            "length": 200, "width": 100, "material_thickness": 1.5,
            "bend_radius": 2.25, "bend_angle": 90, "tab_count": 2,
            "tab_width": 15, "flange_width": 15,
        }

    def constraints(self):
        return [
            Constraint("bend_compression", "Bend radius 0.5-6x thickness",
                lambda s: _check_bend_compression(s), severity="error"),
            Constraint("k_factor_range", "K-factor 0.33-0.50 for bend compensation",
                lambda s: _check_k_factor(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        # K-factor: ratio of neutral axis to thickness
        s["k_factor"] = 0.5 * (1 - s["bend_radius"] / (s["bend_radius"] + s["material_thickness"]))
        # Calculate bend deduction
        s["bend_angle_rad"] = math.radians(s["bend_angle"])
        s["bend_deduction"] = s["bend_radius"] * s["k_factor"] * s["bend_angle_rad"]
        
        # Generate default bends
        s["bends"] = [
            {"edge": "right", "angle": s["bend_angle"]},
            {"edge": "left", "angle": s["bend_angle"]},
        ]
        
        # Generate default tabs
        s["tabs"] = []
        if s["tab_count"] > 0:
            for i in range(s["tab_count"]):
                edge = ["right", "left", "top", "bottom"][i % 4]
                s["tabs"].append({
                    "edge": edge,
                    "width": s["tab_width"],
                    "height": s["material_thickness"] * 2,
                    "position": 0.3 + (i * 0.4 / max(s["tab_count"] - 1, 1))
                })
        
        # Default flanges
        s["flanges"] = []
        
        return s

    def build(self, skeleton):
        s = skeleton
        length = s["length"]
        width = s["width"]
        thickness = s["material_thickness"]
        bend_radius = s["bend_radius"]
        bend_angle = s["bend_angle"]
        
        assy = cq.Assembly(name="ForgeOS_SheetMetal")
        
        # Start with flat blank
        part = _build_sheet_metal_blank(length, width, thickness)
        
        # Add bends
        if len(s.get("bends", [])) > 0:
            part = _add_bends(part, s["bends"], bend_radius, bend_angle, thickness)
        
        # Add mounting tabs
        if len(s.get("tabs", [])) > 0:
            part = _add_tabs(part, s["tabs"], thickness)
        
        # Add edge flanges
        if len(s.get("flanges", [])) > 0:
            part = _add_flanges(part, s["flanges"], thickness)
        
        assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.75, 0.75, 0.78), name="SheetMetalPart")
        
        return assy
$PYSHEETMETAL$,

  -- Core library
  $PYCORE_SHEETMETAL$
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
            for i, item in enumerate(value):
                if not isinstance(item, dict): return False, f"{self.name}[{i}]: expected dict, got {type(item).__name__}"
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
    def display_name(self): return ""
    @property
    @abstractmethod
    def description(self): return ""
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
$PYCORE_SHEETMETAL$,

  -- Param specs as JSON
  '[
    {"name":"length","type":"float","unit":"mm","description":"Part length (X)","default":200,"min_val":50,"max_val":1000},
    {"name":"width","type":"float","unit":"mm","description":"Part width (Y)","default":100,"min_val":50,"max_val":500},
    {"name":"material_thickness","type":"float","unit":"mm","description":"Material thickness (gauge)","default":1.5,"min_val":0.5,"max_val":6.0},
    {"name":"bend_radius","type":"float","unit":"mm","description":"Bend radius (typically 1-2x thickness)","default":2.25,"min_val":0.5,"max_val":10},
    {"name":"bend_angle","type":"float","unit":"degrees","description":"Default bend angle","default":90,"min_val":30,"max_val":150},
    {"name":"tab_count","type":"int","unit":null,"description":"Number of mounting tabs","default":2,"min_val":0,"max_val":8},
    {"name":"tab_width","type":"float","unit":"mm","description":"Tab width","default":15,"min_val":8,"max_val":40},
    {"name":"flange_width","type":"float","unit":"mm","description":"Edge flange width","default":15,"min_val":5,"max_val":50}
  ]'::jsonb,

  -- Defaults as JSON
  '{"length":200,"width":100,"material_thickness":1.5,"bend_radius":2.25,"bend_angle":90,"tab_count":2,"tab_width":15,"flange_width":15}'::jsonb,

  'Bend radius 0.5-6x thickness. K-factor 0.33-0.50 for bend compensation.',
  'built_in',
  1
) ON CONFLICT (name) DO UPDATE SET
  python_code = EXCLUDED.python_code,
  core_library_code = EXCLUDED.core_library_code,
  param_specs = EXCLUDED.param_specs,
  defaults = EXCLUDED.defaults,
  domain_keywords = EXCLUDED.domain_keywords,
  example_prompts = EXCLUDED.example_prompts,
  updated_at = NOW();


-- ─── Pulley Grammar ────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'pulley',
  'Pulley / Belt System',
  'Timing pulleys and V-belt pulleys for power transmission. Configurable pitch diameter, bore size, teeth profile, and flange options.',
  ARRAY['pulley', 'belt', 'timing pulley', 'v-belt', 'gt2', 'gt2 pulley', 'belt drive', 'power transmission', 'synchronous belt', 'tooth belt', 'idler', 'tensioner', 'sheave'],
  ARRAY[
    'Design a GT2 timing pulley with 20 teeth',
    'Create a V-belt pulley for 40mm diameter',
    'Build a pulley with 8mm bore',
    'Make a double-flanged timing pulley',
    'Design a pulley for 5mm pitch timing belt'
  ],
  $PYPULLEY$
"""
ForgeOS Pulley Grammar — Belt Drive Systems
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# Timing belt profiles (mm)
TIMING_PROFILES = {
    "2mm": {"pitch": 2, "tooth_height": 0.75, "belt_thickness": 1.5},
    "3mm": {"pitch": 3, "tooth_height": 1.15, "belt_thickness": 2.2},
    "5mm": {"pitch": 5, "tooth_height": 1.95, "belt_thickness": 3.8},
    "mxl": {"pitch": 2.032, "tooth_height": 0.76, "belt_thickness": 1.14},
    "gt2": {"pitch": 2, "tooth_height": 0.75, "belt_thickness": 1.5},
    "gt3": {"pitch": 3, "tooth_height": 1.15, "belt_thickness": 2.2},
}

# V-belt profiles
V_BELT_PROFILES = {
    "classic": {"top_width": 10, "height": 8},
    "narrow": {"top_width": 9.5, "height": 8},
    "wedge": {"top_width": 12.5, "height": 10},
}

def _build_timing_pulley(pitch_diameter, teeth, bore_diameter, hub_diameter, flange_od, tooth_profile, has_flange):
    """Build timing pulley."""
    # Calculate pitch radius
    pitch_r = pitch_diameter / 2
    
    # Calculate tooth pitch arc length
    tooth_pitch = tooth_profile["pitch"]
    tooth_angle = (tooth_pitch * 2 * math.pi) / pitch_diameter
    
    # Create pulley body
    body = cq.Workplane("XY").circle(pitch_diameter / 2 + 2).extrude(15)
    
    # Cut center bore
    bore = cq.Workplane("XY").circle(bore_diameter / 2).extrude(20)
    body = body.cut(bore)
    
    # Cut hub (if larger than bore)
    if hub_diameter > bore_diameter:
        hub = cq.Workplane("XY").circle(hub_diameter / 2).extrude(8)
        body = body.cut(hub.translate((0, 0, 7)))
    
    # Cut timing teeth
    num_teeth = int(teeth)
    for i in range(num_teeth):
        angle = (2 * math.pi * i) / num_teeth
        tooth_r = pitch_r - tooth_profile["tooth_height"]
        # Create tooth gap
        tooth_width = tooth_pitch * 0.5
        for sign in [-1, 1]:
            x = tooth_r * math.cos(angle + sign * tooth_width / pitch_r / 2)
            y = tooth_r * math.sin(angle + sign * tooth_width / pitch_r / 2)
            tooth_gap = cq.Workplane("XY").circle(1).extrude(15)
            body = body.cut(tooth_gap.translate((x, y, 0)))
    
    # Add flange if requested
    if has_flange and flange_od > pitch_diameter:
        flange = cq.Workplane("XY").circle(flange_od / 2).circle(pitch_diameter / 2 + 0.5).extrude(3)
        body = body.union(flange.translate((0, 0, 6)))
    
    return body

def _build_v_pulley(pitch_diameter, bore_diameter, hub_diameter, flange_od, v_profile, has_flange):
    """Build V-belt pulley (sheave)."""
    # V-belt pulley groove
    top_r = pitch_diameter / 2
    groove_angle = math.radians(34)  # Standard V-groove angle
    
    # Create pulley with groove
    body = cq.Workplane("XY").circle(top_r + 3).extrude(20)
    
    # Cut center bore
    bore = cq.Workplane("XY").circle(bore_diameter / 2).extrude(25)
    body = body.cut(bore)
    
    # Cut hub if larger
    if hub_diameter > bore_diameter:
        hub = cq.Workplane("XY").circle(hub_diameter / 2).extrude(8)
        body = body.cut(hub.translate((0, 0, 10)))
    
    # Cut V-groove
    groove_r = (pitch_diameter - v_profile["height"]) / 2
    groove = cq.Workplane("XY").circle(groove_r).extrude(20)
    # Taper the groove walls
    body = body.cut(groove)
    
    # Add flange if requested
    if has_flange and flange_od > pitch_diameter:
        flange = cq.Workplane("XY").circle(flange_od / 2).circle(top_r + 1).extrude(3)
        body = body.union(flange.translate((0, 0, 8)))
    
    return body

def _check_min_teeth_engagement(s):
    """Timing belt should have minimum teeth in mesh."""
    if s["pulley_type"] in ("timing", "gt2"):
        teeth = s.get("teeth_or_profile")
        if teeth and int(teeth) < 6:
            return False, f"Only {teeth} teeth may cause poor belt engagement (recommend 6+)"
    return True, ""

def _check_bore_to_hub_ratio(s):
    """Hub diameter should not exceed 2x bore."""
    if s["hub_diameter"] > s["bore_diameter"] * 2.5:
        return False, f"Hub {s['hub_diameter']}mm > 2.5x bore {s['bore_diameter']}mm (insufficient strength)"
    return True, ""

class PulleyGrammar(DomainGrammar):
    @property
    def name(self): return "pulley"
    @property
    def display_name(self): return "Pulley / Belt System"
    @property
    def description(self): return "Timing pulleys and V-belt pulleys for power transmission"

    def param_specs(self):
        return [
            ParamSpec("pulley_type", "enum", None, "Pulley/belt type", "timing", enum_options=["timing", "v_belt", "flat"]),
            ParamSpec("teeth_or_profile", "string", None, "Timing: tooth count (e.g. 20), V-belt: profile name", "20", None, None),
            ParamSpec("pitch_diameter", "float", "mm", "Pulley pitch diameter", 40, 10, 200),
            ParamSpec("bore_diameter", "float", "mm", "Shaft bore diameter", 8, 3, 50),
            ParamSpec("hub_diameter", "float", "mm", "Hub/center diameter", 25, 10, 100),
            ParamSpec("flange_od", "float", "mm", "Flange outer diameter (0 for none)", 45, 0, 200),
        ]

    def defaults(self):
        return {
            "pulley_type": "timing", "teeth_or_profile": "20", "pitch_diameter": 40,
            "bore_diameter": 8, "hub_diameter": 25, "flange_od": 45,
        }

    def constraints(self):
        return [
            Constraint("min_teeth_engagement", "Timing pulley should have 6+ teeth",
                lambda s: _check_min_teeth_engagement(s), severity="warning"),
            Constraint("bore_hub_ratio", "Hub <= 2.5x bore diameter",
                lambda s: _check_bore_to_hub_ratio(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        pulley_type = s["pulley_type"]
        
        if pulley_type == "timing":
            s["tooth_profile"] = TIMING_PROFILES.get(str(s["teeth_or_profile"]), TIMING_PROFILES["gt2"])
            s["num_teeth"] = int(s["teeth_or_profile"]) if str(s["teeth_or_profile"]).isdigit() else 20
        elif pulley_type == "v_belt":
            s["v_profile"] = V_BELT_PROFILES.get(str(s["teeth_or_profile"]), V_BELT_PROFILES["classic"])
        
        s["has_flange"] = s["flange_od"] > s["pitch_diameter"]
        
        return s

    def build(self, skeleton):
        s = skeleton
        pulley_type = s["pulley_type"]
        pitch_diameter = s["pitch_diameter"]
        bore_diameter = s["bore_diameter"]
        hub_diameter = s["hub_diameter"]
        flange_od = s["flange_od"]
        
        assy = cq.Assembly(name="ForgeOS_Pulley")
        
        if pulley_type == "timing":
            teeth = s.get("num_teeth", 20)
            tooth_profile = s.get("tooth_profile", TIMING_PROFILES["gt2"])
            part = _build_timing_pulley(
                pitch_diameter, teeth, bore_diameter, hub_diameter, flange_od,
                tooth_profile, s["has_flange"]
            )
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.4, 0.4, 0.45), name="TimingPulley")
        elif pulley_type == "v_belt":
            v_profile = s.get("v_profile", V_BELT_PROFILES["classic"])
            part = _build_v_pulley(
                pitch_diameter, bore_diameter, hub_diameter, flange_od,
                v_profile, s["has_flange"]
            )
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.4, 0.4, 0.45), name="VBeltPulley")
        else:  # flat
            body = cq.Workplane("XY").circle(pitch_diameter / 2).extrude(10)
            bore = cq.Workplane("XY").circle(bore_diameter / 2).extrude(15)
            body = body.cut(bore)
            if hub_diameter > bore_diameter:
                hub = cq.Workplane("XY").circle(hub_diameter / 2).extrude(5)
                body = body.cut(hub.translate((0, 0, 5)))
            assy.add(body, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.4, 0.4, 0.45), name="FlatPulley")
        
        return assy
$PYPULLEY$,

  -- Core library
  $PYCORE_PULLEY$
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
            for i, item in enumerate(value):
                if not isinstance(item, dict): return False, f"{self.name}[{i}]: expected dict, got {type(item).__name__}"
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
    def display_name(self): return ""
    @property
    @abstractmethod
    def description(self): return ""
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
$PYCORE_PULLEY$,

  -- Param specs as JSON
  '[
    {"name":"pulley_type","type":"enum","unit":null,"description":"Pulley/belt type","default":"timing","enum_options":["timing","v_belt","flat"]},
    {"name":"teeth_or_profile","type":"string","unit":null,"description":"Timing: tooth count, V-belt: profile name","default":"20","min_val":null,"max_val":null},
    {"name":"pitch_diameter","type":"float","unit":"mm","description":"Pulley pitch diameter","default":40,"min_val":10,"max_val":200},
    {"name":"bore_diameter","type":"float","unit":"mm","description":"Shaft bore diameter","default":8,"min_val":3,"max_val":50},
    {"name":"hub_diameter","type":"float","unit":"mm","description":"Hub/center diameter","default":25,"min_val":10,"max_val":100},
    {"name":"flange_od","type":"float","unit":"mm","description":"Flange outer diameter (0 for none)","default":45,"min_val":0,"max_val":200}
  ]'::jsonb,

  -- Defaults as JSON
  '{"pulley_type":"timing","teeth_or_profile":"20","pitch_diameter":40,"bore_diameter":8,"hub_diameter":25,"flange_od":45}'::jsonb,

  'Timing pulley 6+ teeth for engagement. Hub <= 2.5x bore diameter.',
  'built_in',
  1
) ON CONFLICT (name) DO UPDATE SET
  python_code = EXCLUDED.python_code,
  core_library_code = EXCLUDED.core_library_code,
  param_specs = EXCLUDED.param_specs,
  defaults = EXCLUDED.defaults,
  domain_keywords = EXCLUDED.domain_keywords,
  example_prompts = EXCLUDED.example_prompts,
  updated_at = NOW();
