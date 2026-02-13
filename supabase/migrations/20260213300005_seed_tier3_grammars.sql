-- ═══════════════════════════════════════════════════════════════
-- Seed CAD Grammars: Tier 3 - Staircase, Lattice Truss, Fourbar Linkage, Nozzle, Spring, Container
-- ═══════════════════════════════════════════════════════════════
-- Python source code is stored using dollar-quoting to avoid escaping.
-- The core_library_code is the base class framework (grammar.py).
-- The python_code is the domain-specific grammar.

-- ─── Staircase Grammar ────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'staircase',
  'Staircase with Handrail',
  'Staircases with configurable rise, run, step dimensions, and handrail profiles. Supports closed, open, and split stringer types in wood, metal, or concrete.',
  ARRAY['staircase', 'stairs', 'stair', 'handrail', 'riser', 'tread', 'stringer', 'steps', 'staircase design', 'architectural', 'building', 'architecture', 'residential', 'commercial', 'fire escape', 'landscape'],
  ARRAY[
    'Design a staircase with 15 steps',
    'Create a straight staircase with 2700mm total rise',
    'Build an open-stringer metal staircase',
    'Make a wooden staircase with round handrail',
    'Design a 900mm wide staircase with 280mm treads'
  ],
  $PYSTAIRCASE$
"""
ForgeOS Staircase Grammar — Architectural Stairs with Handrails
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _calculate_step_positions(total_rise, run_per_step, rise_per_step, number_of_steps):
    """Calculate X, Y, Z positions for each step."""
    steps = []
    for i in range(number_of_steps):
        x = i * run_per_step
        y = 0
        z = i * rise_per_step
        steps.append({"x": x, "y": y, "z": z, "step_num": i + 1})
    return steps

def _build_closed_stringer(run_per_step, rise_per_step, number_of_steps, step_width, thickness):
    """Build closed (solid) stringer with notches for steps."""
    # Total length calculation
    total_run = run_per_step * number_of_steps
    total_rise = rise_per_step * number_of_steps
    hypotenuse = math.sqrt(total_run**2 + total_rise**2)
    
    # Stringer board dimensions
    stringer_length = hypotenuse + 200  # Extra for landing
    stringer_height = 300  # Height of stringer
    stringer_thickness = thickness
    
    # Create main stringer beam
    stringer = cq.Workplane("XY").box(stringer_length, stringer_height, stringer_thickness)
    
    # Calculate angle
    angle = math.atan2(total_rise, total_run)
    stringer = stringer.rotate((0, 0, 0), (0, 0, 1), math.degrees(-angle))
    
    return stringer, angle

def _build_open_stringer(run_per_step, rise_per_step, number_of_steps, step_width, thickness):
    """Build open stringer with visible step supports."""
    # Two parallel stringers
    total_run = run_per_step * number_of_steps
    total_rise = rise_per_step * number_of_steps
    hypotenuse = math.sqrt(total_run**2 + total_rise**2)
    
    stringers = []
    for side in [-1, 1]:
        stringer = cq.Workplane("XY").box(hypotenuse + 200, 100, thickness)
        stringer = stringer.translate((total_run / 2, side * (step_width / 2 + 50), total_rise / 2))
        stringers.append(stringer)
    
    return stringers

def _build_steps(step_width, run_per_step, rise_per_step, number_of_steps, material):
    """Build stair treads and risers."""
    steps = []
    tread_thickness = 30 if material == "wood" else 20
    riser_thickness = 15 if material == "wood" else 10
    
    # Color based on material
    if material == "wood":
        color = cq.Color(0.55, 0.35, 0.2)  # Brown wood
    elif material == "metal":
        color = cq.Color(0.6, 0.6, 0.65)  # Gray metal
    else:  # concrete
        color = cq.Color(0.7, 0.7, 0.7)  # Gray concrete
    
    for i in range(number_of_steps):
        # Tread
        tread = cq.Workplane("XY").box(run_per_step + 20, step_width, tread_thickness)
        tread = tread.translate((i * run_per_step, 0, i * rise_per_step + tread_thickness / 2))
        
        # Riser
        riser = cq.Workplane("XY").box(15, step_width, rise_per_step)
        riser = riser.translate((i * run_per_step + run_per_step + 7.5, 0, i * rise_per_step + rise_per_step / 2))
        
        steps.append({"tread": tread, "riser": riser, "color": color})
    
    return steps

def _build_handrail(step_width, total_rise, total_run, handrail_height, handrail_profile, number_of_steps, material):
    """Build handrail with posts."""
    handrail_parts = []
    
    # Rail
    rail_y = step_width / 2 + 50
    rail_z = handrail_height
    rail_length = math.sqrt(total_run**2 + total_rise**2) + 200
    
    if handrail_profile == "round":
        rail = cq.Workplane("XY").cylinder(rail_length, 15, angle=360)
    else:  # rectangular
        rail = cq.Workplane("XY").box(rail_length, 30, 10)
    
    # Rotate to match staircase angle
    angle = math.atan2(total_rise, total_run)
    rail = rail.rotate((0, 0, 0), (0, 0, 1), math.degrees(-angle))
    rail = rail.translate((total_run / 2, rail_y, rail_z))
    handrail_parts.append(rail)
    
    # Posts
    post_interval = max(3, number_of_steps // 4)
    for i in range(0, number_of_steps + 1, post_interval):
        x = i * total_run / number_of_steps if number_of_steps > 0 else 0
        post_height = handrail_height + 100
        post = cq.Workplane("XY").box(40, 40, post_height)
        post = post.translate((x, rail_y, post_height / 2))
        handrail_parts.append(post)
    
    # Handrail color
    if material == "wood":
        color = cq.Color(0.45, 0.25, 0.15)
    elif material == "metal":
        color = cq.Color(0.5, 0.5, 0.55)
    else:
        color = cq.Color(0.6, 0.6, 0.6)
    
    return handrail_parts, color

def _check_step_proportions(s):
    """Step rise + run should be comfortable (150-200mm per step ideal)."""
    rise = s["rise_per_step"]
    run = s["run_per_step"]
    total = rise + run
    if total < 100 or total > 250:
        return False, f"Rise + run = {total:.0f}mm outside comfortable range 100-250mm"
    return True, ""

def _check_handrail_height(s):
    """Handrail height should be 900-1100mm above step."""
    h = s["handrail_height"]
    if h < 800 or h > 1200:
        return False, f"Handrail height {h}mm outside code range 800-1200mm"
    return True, ""

class StaircaseGrammar(DomainGrammar):
    @property
    def name(self): return "staircase"
    @property
    def display_name(self): return "Staircase with Handrail"
    @property
    def description(self): return "Staircases with configurable rise, run, and handrail"

    def param_specs(self):
        return [
            ParamSpec("total_rise", "float", "mm", "Total floor-to-floor height", 2700, 1500, 4000),
            ParamSpec("run_per_step", "float", "mm", "Horizontal tread depth", 280, 200, 400),
            ParamSpec("rise_per_step", "float", "mm", "Vertical riser height", 180, 120, 220),
            ParamSpec("number_of_steps", "int", None, "Number of steps", 15, 2, 30),
            ParamSpec("step_width", "float", "mm", "Width of staircase", 900, 600, 1500),
            ParamSpec("handrail_height", "float", "mm", "Height above step", 900, 800, 1100),
            ParamSpec("handrail_profile", "enum", None, "Handrail cross-section", "round", enum_options=["round", "rectangular"]),
            ParamSpec("stringer_type", "enum", None, "Stringer style", "closed", enum_options=["closed", "open", "split"]),
            ParamSpec("material", "enum", None, "Staircase material", "wood", enum_options=["wood", "metal", "concrete"]),
        ]

    def defaults(self):
        return {
            "total_rise": 2700, "run_per_step": 280, "rise_per_step": 180,
            "number_of_steps": 15, "step_width": 900, "handrail_height": 900,
            "handrail_profile": "round", "stringer_type": "closed", "material": "wood",
        }

    def constraints(self):
        return [
            Constraint("step_proportions", "Rise + run should be 100-250mm",
                lambda s: _check_step_proportions(s), severity="warning"),
            Constraint("handrail_height", "Handrail 800-1200mm above step",
                lambda s: _check_handrail_height(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        # Calculate derived values
        s["total_run"] = s["run_per_step"] * s["number_of_steps"]
        s["step_positions"] = _calculate_step_positions(
            s["total_rise"], s["run_per_step"], s["rise_per_step"], s["number_of_steps"]
        )
        # Calculate stringer angle
        s["stringer_angle"] = math.atan2(s["total_rise"], s["total_run"])
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Staircase")
        
        # Build stringers
        if s["stringer_type"] == "closed":
            stringer, angle = _build_closed_stringer(
                s["run_per_step"], s["rise_per_step"], s["number_of_steps"],
                s["step_width"], 30
            )
            color = cq.Color(0.55, 0.35, 0.2) if s["material"] == "wood" else cq.Color(0.6, 0.6, 0.65)
            assy.add(stringer, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="StringerLeft")
            # Right stringer
            stringer2 = _build_closed_stringer(
                s["run_per_step"], s["rise_per_step"], s["number_of_steps"],
                s["step_width"], 30
            )[0]
            stringer2 = stringer2.translate((0, s["step_width"], 0))
            assy.add(stringer2, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="StringerRight")
        elif s["stringer_type"] == "open":
            stringers = _build_open_stringer(
                s["run_per_step"], s["rise_per_step"], s["number_of_steps"],
                s["step_width"], 20
            )
            color = cq.Color(0.6, 0.6, 0.65)
            for i, stringer in enumerate(stringers):
                assy.add(stringer, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name=f"Stringer{i}")
        
        # Build steps
        step_data = _build_steps(
            s["step_width"], s["run_per_step"], s["rise_per_step"],
            s["number_of_steps"], s["material"]
        )
        for i, data in enumerate(step_data):
            assy.add(data["tread"], loc=cq.Location(cq.Vector(0, 0, 0)), color=data["color"], name=f"Tread{i+1}")
            assy.add(data["riser"], loc=cq.Location(cq.Vector(0, 0, 0)), color=data["color"], name=f"Riser{i+1}")
        
        # Build handrail
        handrail_parts, handrail_color = _build_handrail(
            s["step_width"], s["total_rise"], s["total_run"],
            s["handrail_height"], s["handrail_profile"], s["number_of_steps"], s["material"]
        )
        for i, part in enumerate(handrail_parts):
            assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=handrail_color, name=f"HandrailPart{i}")
        
        return assy
$PYSTAIRCASE$,

  -- Core library
  $PYCORE_STAIRCASE$
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
$PYCORE_STAIRCASE$,

  -- Param specs as JSON
  '[{"name":"total_rise","type":"float","unit":"mm","description":"Total floor-to-floor height","default":2700,"min_val":1500,"max_val":4000},{"name":"run_per_step","type":"float","unit":"mm","description":"Horizontal tread depth","default":280,"min_val":200,"max_val":400},{"name":"rise_per_step","type":"float","unit":"mm","description":"Vertical riser height","default":180,"min_val":120,"max_val":220},{"name":"number_of_steps","type":"int","unit":null,"description":"Number of steps","default":15,"min_val":2,"max_val":30},{"name":"step_width","type":"float","unit":"mm","description":"Width of staircase","default":900,"min_val":600,"max_val":1500},{"name":"handrail_height","type":"float","unit":"mm","description":"Height above step","default":900,"min_val":800,"max_val":1100},{"name":"handrail_profile","type":"enum","unit":null,"description":"Handrail cross-section","default":"round","enum_options":["round","rectangular"]},{"name":"stringer_type","type":"enum","unit":null,"description":"Stringer style","default":"closed","enum_options":["closed","open","split"]},{"name":"material","type":"enum","unit":null,"description":"Staircase material","default":"wood","enum_options":["wood","metal","concrete"]}]'::jsonb,

  -- Defaults as JSON
  '{"total_rise":2700,"run_per_step":280,"rise_per_step":180,"number_of_steps":15,"step_width":900,"handrail_height":900,"handrail_profile":"round","stringer_type":"closed","material":"wood"}'::jsonb,

  'Rise + run 100-250mm. Handrail 800-1200mm above step.',
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


-- ─── Lattice Truss Grammar ────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'lattice_truss',
  'Space Frame / Truss',
  'Planar and space trusses with configurable types (Warren, Pratt, Howe, King Post, Queen Post). Derives panel lengths and node positions.',
  ARRAY['truss', 'space frame', 'lattice', 'structure', 'structural', 'warren truss', 'pratt truss', 'howe truss', 'king post', 'queen post', 'steel structure', 'bridge', 'roof truss', 'space truss', 'structural engineering'],
  ARRAY[
    'Design a Warren truss with 6m span',
    'Create a Pratt truss for 8m span',
    'Build a king post truss roof',
    'Make a 10m span truss with 600mm height',
    'Design a steel space frame with pinned ends'
  ],
  $PYTRUSS$
"""
ForgeOS Lattice Truss Grammar — Space Frames and Structural Trusses
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _calculate_warren_nodes(span, height, panel_count):
    """Calculate node positions for Warren truss."""
    nodes = []
    dx = span / panel_count
    dy = height
    
    # Bottom chord nodes
    for i in range(panel_count + 1):
        nodes.append({"x": i * dx, "y": 0, "z": 0, "chord": "bottom", "node_id": i})
    
    # Top chord nodes
    for i in range(panel_count):
        x = (i + 0.5) * dx
        y = dy
        nodes.append({"x": x, "y": y, "z": 0, "chord": "top", "node_id": panel_count + i})
    
    return nodes

def _calculate_pratt_nodes(span, height, panel_count):
    """Calculate node positions for Pratt truss."""
    nodes = []
    dx = span / panel_count
    dy = height
    
    # Bottom chord
    for i in range(panel_count + 1):
        nodes.append({"x": i * dx, "y": 0, "z": 0, "chord": "bottom", "node_id": i})
    
    # Top chord
    for i in range(panel_count + 1):
        nodes.append({"x": i * dx, "y": dy, "z": 0, "chord": "top", "panel_count + i})
    
    return nodes

def _calculate_king_post_nodes(span, height):
    """Calculate node positions for King Post truss."""
    nodes = [
        {"x": 0, "y": 0, "z": 0, "chord": "bottom", "node_id": 0},
        {"x": span / 2, "y": height, "z": 0, "chord": "top", "node_id": 1},
        {"x": span, "y": 0, "z": 0, "chord": "bottom", "node_id": 2},
    ]
    return nodes

def _build_truss_members(nodes, chord_size, web_size, truss_type):
    """Build truss members from node positions."""
    members = []
    
    # Determine which nodes to connect based on truss type
    bottom_nodes = [n for n in nodes if n.get("chord") == "bottom"]
    top_nodes = [n for n in nodes if n.get("chord") == "top"]
    
    # Bottom chord
    for i in range(len(bottom_nodes) - 1):
        n1, n2 = bottom_nodes[i], bottom_nodes[i + 1]
        length = math.sqrt((n2["x"] - n1["x"])**2 + (n2["y"] - n1["y"])**2)
        member = cq.Workplane("XY").box(length, chord_size, chord_size)
        member = member.translate(((n1["x"] + n2["x"]) / 2, (n1["y"] + n2["y"]) / 2, chord_size / 2))
        members.append({"part": member, "type": "chord", "length": length})
    
    # Top chord
    for i in range(len(top_nodes) - 1):
        n1, n2 = top_nodes[i], top_nodes[i + 1]
        length = math.sqrt((n2["x"] - n1["x"])**2 + (n2["y"] - n1["y"])**2)
        member = cq.Workplane("XY").box(length, chord_size, chord_size)
        member = member.translate(((n1["x"] + n2["x"]) / 2, (n1["y"] + n2["y"]) / 2, chord_size / 2))
        members.append({"part": member, "type": "chord", "length": length})
    
    # Web members
    for bn in bottom_nodes:
        for tn in top_nodes:
            # Simple diagonal pattern
            dx = tn["x"] - bn["x"]
            dy = tn["y"] - bn["y"]
            if abs(dx) > 0.01:  # Skip vertical members
                length = math.sqrt(dx**2 + dy**2)
                member = cq.Workplane("XY").box(length, web_size, web_size)
                # Rotate to match diagonal
                angle = math.degrees(math.atan2(dy, dx))
                member = member.rotate((0, 0, 0), (0, 0, 1), -angle)
                member = member.translate((bn["x"] + dx / 2, bn["y"] + dy / 2, web_size / 2))
                members.append({"part": member, "type": "web", "length": length})
    
    return members

def _check_truss_aspect_ratio(s):
    """Truss depth should be 1/10 to 1/20 of span."""
    span = s["span"]
    height = s["height"]
    ratio = span / height if height > 0 else 0
    if ratio < 5 or ratio > 25:
        return False, f"Span/height ratio {ratio:.1f} outside typical range 5-25"
    return True, ""

def _check_panel_count(s):
    """Panel count should be reasonable for span."""
    span = s["span"]
    panel_count = s["panel_count"]
    panel_length = span / panel_count if panel_count > 0 else 0
    if panel_length < 300:
        return False, f"Panel length {panel_length:.0f}mm too small (min ~300mm)"
    if panel_length > 2000:
        return False, f"Panel length {panel_length:.0f}mm too large (max ~2000mm)"
    return True, ""

class LatticeTrussGrammar(DomainGrammar):
    @property
    def name(self): return "lattice_truss"
    @property
    def display_name(self): return "Space Frame / Truss"
    @property
    def description(self): return "Planar and space trusses with configurable types"

    def param_specs(self):
        return [
            ParamSpec("truss_type", "enum", None, "Truss configuration", "warren", enum_options=["warren", "pratt", "howe", "king_post", "queen_post"]),
            ParamSpec("span", "float", "mm", "Truss span", 6000, 2000, 20000),
            ParamSpec("height", "float", "mm", "Truss depth/height", 600, 300, 3000),
            ParamSpec("panel_count", "int", None, "Number of panels", 6, 2, 20),
            ParamSpec("chord_size", "float", "mm", "Chord member size (square)", 50, 20, 150),
            ParamSpec("web_size", "float", "mm", "Web member size (square)", 30, 15, 100),
            ParamSpec("end_condition", "enum", None, "End support type", "pinned", enum_options=["pinned", "fixed"]),
        ]

    def defaults(self):
        return {
            "truss_type": "warren", "span": 6000, "height": 600,
            "panel_count": 6, "chord_size": 50, "web_size": 30, "end_condition": "pinned",
        }

    def constraints(self):
        return [
            Constraint("aspect_ratio", "Span/depth ratio should be 5-25",
                lambda s: _check_truss_aspect_ratio(s), severity="warning"),
            Constraint("panel_count", "Panel length 300-2000mm",
                lambda s: _check_panel_count(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        # Calculate node positions based on truss type
        if s["truss_type"] == "king_post":
            s["nodes"] = _calculate_king_post_nodes(s["span"], s["height"])
        elif s["truss_type"] == "warren":
            s["nodes"] = _calculate_warren_nodes(s["span"], s["height"], s["panel_count"])
        else:  # pratt, howe, queen_post
            s["nodes"] = _calculate_pratt_nodes(s["span"], s["height"], s["panel_count"])
        
        s["panel_length"] = s["span"] / s["panel_count"] if s["panel_count"] > 0 else 0
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_LatticeTruss")
        
        # Build truss members
        members = _build_truss_members(
            s["nodes"], s["chord_size"], s["web_size"], s["truss_type"]
        )
        
        # Steel color
        color = cq.Color(0.5, 0.5, 0.55)
        
        for i, member in enumerate(members):
            assy.add(member["part"], loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name=f"Member{i}")
        
        # Add end plates based on end condition
        if s["end_condition"] == "pinned":
            # Pinned support plate
            plate = cq.Workplane("XY").box(s["chord_size"] * 2, s["chord_size"] * 2, 10)
            plate = plate.translate((0, 0, -5))
            assy.add(plate, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="LeftSupport")
            plate2 = plate.translate((s["span"], 0, 0))
            assy.add(plate2, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="RightSupport")
        
        return assy
$PYTRUSS$,

  -- Core library
  $PYCORE_TRUSS$
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
$PYCORE_TRUSS$,

  -- Param specs as JSON
  '[{"name":"truss_type","type":"enum","unit":null,"description":"Truss configuration","default":"warren","enum_options":["warren","pratt","howe","king_post","queen_post"]},{"name":"span","type":"float","unit":"mm","description":"Truss span","default":6000,"min_val":2000,"max_val":20000},{"name":"height","type":"float","unit":"mm","description":"Truss depth/height","default":600,"min_val":300,"max_val":3000},{"name":"panel_count","type":"int","unit":null,"description":"Number of panels","default":6,"min_val":2,"max_val":20},{"name":"chord_size","type":"float","unit":"mm","description":"Chord member size (square)","default":50,"min_val":20,"max_val":150},{"name":"web_size","type":"float","unit":"mm","description":"Web member size (square)","default":30,"min_val":15,"max_val":100},{"name":"end_condition","type":"enum","unit":null,"description":"End support type","default":"pinned","enum_options":["pinned","fixed"]}]'::jsonb,

  -- Defaults as JSON
  '{"truss_type":"warren","span":6000,"height":600,"panel_count":6,"chord_size":50,"web_size":30,"end_condition":"pinned"}'::jsonb,

  'Span/depth ratio 5-25. Panel length 300-2000mm.',
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


-- ─── Four-Bar Linkage Grammar ────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'fourbar_linkage',
  'Four-Bar Linkage Mechanism',
  'Planar four-bar linkages with configurable link lengths. Crank-rocker and rocker-crank types. Derives positions through full rotation and toggle positions.',
  ARRAY['four bar', 'fourbar', 'linkage', 'mechanism', 'kinematics', 'crank', 'rocker', 'coupler', 'linkage mechanism', 'planar mechanism', 'motion', '机械', '连杆', 'motion simulation', 'quick return', 'toggle mechanism'],
  ARRAY[
    'Design a four-bar linkage with 30mm crank',
    'Create a crank-rocker mechanism',
    'Build a four-bar with 80mm coupler',
    'Make a linkage with toggle positions',
    'Design a quick-return mechanism'
  ],
  $PYFOURBAR$
"""
ForgeOS Four-Bar Linkage Grammar — Planar Mechanisms
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _calculate_linkage_positions(crank_length, coupler_length, rocker_length, ground_length, coupler_point):
    """Calculate all linkage positions through 360 degrees."""
    positions = []
    steps = 36  # 10-degree increments
    
    for i in range(steps):
        theta = 2 * math.pi * i / steps
        
        # Crank position
        cx = crank_length * math.cos(theta)
        cy = crank_length * math.sin(theta)
        
        # Use law of cosines to find rocker angle
        # Ground-Crank-Rocker triangle
        a = rocker_length
        b = coupler_length
        c = ground_length
        
        # Rocker angle from horizontal
        try:
            cos_r = (a**2 + c**2 - b**2 + 2*a*c*cx/crank_length) / (2*a*c)
            cos_r = max(-1, min(1, cos_r))
            rocker_angle = math.acos(cos_r)
            
            # Determine which solution
            ry = cy * (rocker_angle / (math.pi / 2))
            rx = math.sqrt(rocker_length**2 - ry**2) if rocker_length**2 > ry**2 else 0
        except:
            rx, ry = 0, 0
        
        # Coupler point
        cpx = cx + coupler_point[0]
        cpy = cy + coupler_point[1]
        
        positions.append({
            "crank_x": cx, "crank_y": cy,
            "rocker_x": rx, "rocker_y": ry,
            "coupler_x": cpx, "coupler_y": cpy,
            "theta": theta
        })
    
    return positions

def _find_toggle_positions(positions):
    """Find toggle (dead-center) positions."""
    toggles = []
    for i in range(len(positions) - 1):
        p1, p2 = positions[i], positions[i + 1]
        # Check for direction change in rocker
        if (p1["rocker_y"] > 0 and p2["rocker_y"] < 0) or (p1["rocker_y"] < 0 and p2["rocker_y"] > 0):
            toggles.append({"pos": p1, "type": "inner"})
    return toggles

def _build_link(length, width, thickness, color, name_prefix):
    """Build a single link/bar."""
    link = cq.Workplane("XY").box(length, width, thickness)
    return link

def _build_joint(diameter, thickness):
    """Build a pivot joint."""
    joint = cq.Workplane("XY").cylinder(thickness, diameter / 2, angle=360)
    return joint

def _check_grashof_condition(s):
    """Check if linkage is Grashof (continuous rotation possible)."""
    crank = s["crank_length"]
    coupler = s["coupler_length"]
    rocker = s["rocker_length"]
    ground = s["ground_length"]
    
    links = sorted([crank, coupler, rocker, ground])
    if links[0] + links[3] < links[1] + links[2]:
        return True, "Grashof (continuous rotation possible)"
    return False, "Non-Grashof (rocking only)"

def _check_linkage_triangle(s):
    """Links must satisfy triangle inequality."""
    crank = s["crank_length"]
    coupler = s["coupler_length"]
    rocker = s["rocker_length"]
    ground = s["ground_length"]
    
    if crank + coupler <= rocker or crank + rocker <= coupler:
        return False, "Link lengths cannot form valid mechanism"
    return True, ""

class FourbarLinkageGrammar(DomainGrammar):
    @property
    def name(self): return "fourbar_linkage"
    @property
    def display_name(self): return "Four-Bar Linkage Mechanism"
    @property
    def description(self): return "Planar four-bar linkages with configurable link lengths"

    def param_specs(self):
        return [
            ParamSpec("crank_length", "float", "mm", "Crank/link 1 length", 30, 10, 100),
            ParamSpec("coupler_length", "float", "mm", "Coupler/link 2 length", 80, 30, 200),
            ParamSpec("rocker_length", "float", "mm", "Rocker/link 3 length", 60, 20, 150),
            ParamSpec("ground_length", "float", "mm", "Ground/link 4 (frame) length", 100, 50, 250),
            ParamSpec("crank_type", "enum", None, "Input link type", "crank", enum_options=["crank", "rocker"]),
            ParamSpec("coupler_point_x_offset", "float", "mm", "Coupler point X offset", 40, 0, 150),
            ParamSpec("coupler_point_y_offset", "float", "mm", "Coupler point Y offset", 20, -50, 50),
            ParamSpec("link_thickness", "float", "mm", "Link material thickness", 8, 3, 20),
            ParamSpec("joint_diameter", "float", "mm", "Pivot joint diameter", 12, 5, 30),
        ]

    def defaults(self):
        return {
            "crank_length": 30, "coupler_length": 80, "rocker_length": 60,
            "ground_length": 100, "crank_type": "crank",
            "coupler_point_x_offset": 40, "coupler_point_y_offset": 20,
            "link_thickness": 8, "joint_diameter": 12,
        }

    def constraints(self):
        return [
            Constraint("grashof", "Grashof condition for rotation type",
                lambda s: _check_grashof_condition(s), severity="warning"),
            Constraint("triangle", "Links must satisfy triangle inequality",
                lambda s: _check_linkage_triangle(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        # Calculate coupler point offset
        s["coupler_point"] = (s["coupler_point_x_offset"], s["coupler_point_y_offset"])
        
        # Calculate positions
        s["positions"] = _calculate_linkage_positions(
            s["crank_length"], s["coupler_length"], s["rocker_length"],
            s["ground_length"], s["coupler_point"]
        )
        
        # Find toggle positions
        s["toggles"] = _find_toggle_positions(s["positions"])
        
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_FourBarLinkage")
        
        # Metal gray color
        color = cq.Color(0.45, 0.45, 0.5)
        joint_color = cq.Color(0.3, 0.3, 0.35)
        
        # Build ground link (frame)
        ground = _build_link(s["ground_length"], 20, s["link_thickness"], color, "Ground")
        ground = ground.translate((s["ground_length"] / 2, 0, s["link_thickness"] / 2))
        assy.add(ground, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="GroundLink")
        
        # Build crank
        crank = _build_link(s["crank_length"], 15, s["link_thickness"], color, "Crank")
        crank = crank.translate((s["crank_length"] / 2, 30, s["link_thickness"] / 2))
        assy.add(crank, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="CrankLink")
        
        # Build coupler
        coupler = _build_link(s["coupler_length"], 12, s["link_thickness"], color, "Coupler")
        coupler = coupler.translate((s["crank_length"] + s["coupler_length"] / 2, 30, s["link_thickness"] / 2))
        assy.add(coupler, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="CouplerLink")
        
        # Build rocker
        rocker = _build_link(s["rocker_length"], 15, s["link_thickness"], color, "Rocker")
        rocker = rocker.translate((s["ground_length"] - s["rocker_length"] / 2, 0, s["link_thickness"] / 2))
        assy.add(rocker, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="RockerLink")
        
        # Build joints
        joint_positions = [
            (0, 0),  # Ground-crank joint
            (s["crank_length"], 30),  # Crank-coupler joint
            (s["ground_length"], 0),  # Ground-rocker joint
        ]
        for i, (x, y) in enumerate(joint_positions):
            joint = _build_joint(s["joint_diameter"], s["link_thickness"] + 2)
            joint = joint.translate((x, y, 0))
            assy.add(joint, loc=cq.Location(cq.Vector(0, 0, 0)), color=joint_color, name=f"Joint{i}")
        
        # Coupler point marker
        cp_x = s["crank_length"] + s["coupler_point_x_offset"]
        cp_y = 30 + s["coupler_point_y_offset"]
        cp_marker = cq.Workplane("XY").sphere(s["joint_diameter"] / 2)
        cp_marker = cp_marker.translate((cp_x, cp_y, s["link_thickness"] / 2))
        assy.add(cp_marker, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.8, 0.3, 0.3), name="CouplerPoint")
        
        return assy
$PYFOURBAR$,

  -- Core library
  $PYCORE_FOURBAR$
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
$PYCORE_FOURBAR$,

  -- Param specs as JSON
  '[{"name":"crank_length","type":"float","unit":"mm","description":"Crank/link 1 length","default":30,"min_val":10,"max_val":100},{"name":"coupler_length","type":"float","unit":"mm","description":"Coupler/link 2 length","default":80,"min_val":30,"max_val":200},{"name":"rocker_length","type":"float","unit":"mm","description":"Rocker/link 3 length","default":60,"min_val":20,"max_val":150},{"name":"ground_length","type":"float","unit":"mm","description":"Ground/link 4 (frame) length","default":100,"min_val":50,"max_val":250},{"name":"crank_type","type":"enum","unit":null,"description":"Input link type","default":"crank","enum_options":["crank","rocker"]},{"name":"coupler_point_x_offset","type":"float","unit":"mm","description":"Coupler point X offset","default":40,"min_val":0,"max_val":150},{"name":"coupler_point_y_offset","type":"float","unit":"mm","description":"Coupler point Y offset","default":20,"min_val":-50,"max_val":50},{"name":"link_thickness","type":"float","unit":"mm","description":"Link material thickness","default":8,"min_val":3,"max_val":20},{"name":"joint_diameter","type":"float","unit":"mm","description":"Pivot joint diameter","default":12,"min_val":5,"max_val":30}]'::jsonb,

  -- Defaults as JSON
  '{"crank_length":30,"coupler_length":80,"rocker_length":60,"ground_length":100,"crank_type":"crank","coupler_point_x_offset":40,"coupler_point_y_offset":20,"link_thickness":8,"joint_diameter":12}'::jsonb,

  'Grashof condition for rotation. Links must satisfy triangle inequality.',
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


-- ─── Nozzle Grammar ────────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'nozzle',
  'Converging-Diverging Nozzle',
  'Converging-diverging (De Laval) nozzles for compressible flow. Configurable inlet, throat, and exit diameters with convergence/divergence angles.',
  ARRAY['nozzle', 'converging', 'diverging', 'de laval', 'supersonic', 'compressible flow', 'throat', 'aerospace', 'propulsion', 'rocket', 'thrust', 'differential', 'venturi', 'flow', 'convergent', '喉管', '喷嘴'],
  ARRAY[
    'Design a converging-diverging nozzle',
    'Create a De Laval nozzle with 100mm inlet',
    'Build a supersonic nozzle with 40mm throat',
    'Make a rocket nozzle with 30 degree convergence',
    'Design a supersonic wind tunnel nozzle'
  ],
  $PYNOZZLE$
"""
ForgeOS Nozzle Grammar — Converging-Diverging (De Laval) Nozzles
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _calculate_nozzle_profile(inlet_diameter, throat_diameter, exit_diameter, length_converging, length_diverging):
    """Calculate nozzle contour points."""
    points = []
    
    # Inlet section (constant diameter)
    points.append({"x": 0, "r": inlet_diameter / 2})
    
    # Start of convergence
    convergence_points = 10
    for i in range(convergence_points + 1):
        t = i / convergence_points
        x = t * length_converging
        r = (inlet_diameter / 2) - t * (inlet_diameter / 2 - throat_diameter / 2)
        points.append({"x": x, "r": r})
    
    # Throat
    points.append({"x": length_converging, "r": throat_diameter / 2})
    
    # Start of divergence
    divergence_points = 15
    for i in range(1, divergence_points + 1):
        t = i / divergence_points
        x = length_converging + t * length_diverging
        r = (throat_diameter / 2) + t * (exit_diameter / 2 - throat_diameter / 2)
        points.append({"x": x, "r": r})
    
    # Exit
    points.append({"x": length_converging + length_diverging, "r": exit_diameter / 2})
    
    return points

def _build_nozzle_body(inlet_diameter, throat_diameter, exit_diameter, length_converging, length_diverging, wall_thickness):
    """Build nozzle as lathe/revolution."""
    profile = _calculate_nozzle_profile(inlet_diameter, throat_diameter, exit_diameter, length_converging, length_diverging)
    
    # Create outer profile
    outer_pts = [(p["x"], p["r"] + wall_thickness) for p in profile]
    inner_pts = [(p["x"], p["r"]) for p in profile]
    
    # Build as revolve
    nozzle = cq.Workplane("XY").moveTo(outer_pts[0][0], 0)
    for x, r in outer_pts:
        nozzle = nozzle.lineTo(x, r)
    for x, r in reversed(inner_pts):
        nozzle = nozzle.lineTo(x, r)
    nozzle = nozzle.close().revolve()
    
    return nozzle

def _check_area_ratio(s):
    """Check exit/throat area ratio is reasonable for Mach number."""
    throat_r = s["throat_diameter"] / 2
    exit_r = s["exit_diameter"] / 2
    area_ratio = (exit_r / throat_r) ** 2
    
    if area_ratio < 1:
        return False, "Exit area must be larger than throat (exit > throat)"
    if area_ratio > 10:
        return False, f"Area ratio {area_ratio:.1f} very high (typically 2-5)"
    return True, ""

def _check_convergence_angle(s):
    """Check convergence angle (should be < 45 degrees for smooth flow)."""
    conv_angle = s["convergence_angle_deg"]
    if conv_angle > 60:
        return False, f"Convergence angle {conv_angle}° too high (max ~60°)"
    return True, ""

def _check_divergence_angle(s):
    """Check divergence angle (should be < 30 degrees for stable flow)."""
    div_angle = s["divergence_angle_deg"]
    if div_angle > 45:
        return False, f"Divergence angle {div_angle}° too high (max ~45°)"
    return True, ""

class NozzleGrammar(DomainGrammar):
    @property
    def name(self): return "nozzle"
    @property
    def display_name(self): return "Converging-Diverging Nozzle"
    @property
    def description(self): return "Converging-diverging (De Laval) nozzles for compressible flow"

    def param_specs(self):
        return [
            ParamSpec("inlet_diameter", "float", "mm", "Nozzle inlet diameter", 100, 20, 500),
            ParamSpec("throat_diameter", "float", "mm", "Throat (minimum) diameter", 40, 10, 200),
            ParamSpec("exit_diameter", "float", "mm", "Nozzle exit diameter", 80, 20, 400),
            ParamSpec("length_converging", "float", "mm", "Converging section length", 50, 20, 200),
            ParamSpec("length_diverging", "float", "mm", "Diverging section length", 100, 30, 400),
            ParamSpec("convergence_angle_deg", "float", "degrees", "Convergence half-angle", 30, 10, 60),
            ParamSpec("divergence_angle_deg", "float", "degrees", "Divergence half-angle", 15, 5, 45),
            ParamSpec("wall_thickness", "float", "mm", "Nozzle wall thickness", 3, 1, 15),
        ]

    def defaults(self):
        return {
            "inlet_diameter": 100, "throat_diameter": 40, "exit_diameter": 80,
            "length_converging": 50, "length_diverging": 100,
            "convergence_angle_deg": 30, "divergence_angle_deg": 15,
            "wall_thickness": 3,
        }

    def constraints(self):
        return [
            Constraint("area_ratio", "Exit area > throat area",
                lambda s: _check_area_ratio(s), severity="error"),
            Constraint("convergence_angle", "Convergence angle <= 60°",
                lambda s: _check_convergence_angle(s), severity="warning"),
            Constraint("divergence_angle", "Divergence angle <= 45°",
                lambda s: _check_divergence_angle(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        # Calculate profile points
        s["profile"] = _calculate_nozzle_profile(
            s["inlet_diameter"], s["throat_diameter"], s["exit_diameter"],
            s["length_converging"], s["length_diverging"]
        )
        
        # Calculate derived values
        throat_r = s["throat_diameter"] / 2
        exit_r = s["exit_diameter"] / 2
        s["area_ratio"] = (exit_r / throat_r) ** 2
        
        # Calculate effective lengths from angles
        # tan(angle) = (r_change) / length
        s["effective_conv_length"] = (s["inlet_diameter"] / 2 - s["throat_diameter"] / 2) / math.tan(math.radians(s["convergence_angle_deg"]))
        s["effective_div_length"] = (s["exit_diameter"] / 2 - s["throat_diameter"] / 2) / math.tan(math.radians(s["divergence_angle_deg"]))
        
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Nozzle")
        
        # Build nozzle body
        nozzle = _build_nozzle_body(
            s["inlet_diameter"], s["throat_diameter"], s["exit_diameter"],
            s["length_converging"], s["length_diverging"],
            s["wall_thickness"]
        )
        
        # Steel/inconel color for high-temp
        color = cq.Color(0.55, 0.55, 0.6)
        assy.add(nozzle, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="NozzleBody")
        
        # Add inlet flange
        flange_od = s["inlet_diameter"] + 20
        flange = cq.Workplane("XY").circle(flange_od / 2).circle(s["inlet_diameter"] / 2).extrude(8)
        flange = flange.translate((0, 0, -4))
        assy.add(flange, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="InletFlange")
        
        # Add exit flange
        exit_flange_od = s["exit_diameter"] + 20
        exit_flange = cq.Workplane("XY").circle(exit_flange_od / 2).circle(s["exit_diameter"] / 2).extrude(8)
        exit_flange = exit_flange.translate((s["length_converging"] + s["length_diverging"], 0, -4))
        assy.add(exit_flange, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="ExitFlange")
        
        return assy
$PYNOZZLE$,

  -- Core library
  $PYCORE_NOZZLE$
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
$PYCORE_NOZZLE$,

  -- Param specs as JSON
  '[{"name":"inlet_diameter","type":"float","unit":"mm","description":"Nozzle inlet diameter","default":100,"min_val":20,"max_val":500},{"name":"throat_diameter","type":"float","unit":"mm","description":"Throat (minimum) diameter","default":40,"min_val":10,"max_val":200},{"name":"exit_diameter","type":"float","unit":"mm","description":"Nozzle exit diameter","default":80,"min_val":20,"max_val":400},{"name":"length_converging","type":"float","unit":"mm","description":"Converging section length","default":50,"min_val":20,"max_val":200},{"name":"length_diverging","type":"float","unit":"mm","description":"Diverging section length","default":100,"min_val":30,"max_val":400},{"name":"convergence_angle_deg","type":"float","unit":"degrees","description":"Convergence half-angle","default":30,"min_val":10,"max_val":60},{"name":"divergence_angle_deg","type":"float","unit":"degrees","description":"Divergence half-angle","default":15,"min_val":5,"max_val":45},{"name":"wall_thickness","type":"float","unit":"mm","description":"Nozzle wall thickness","default":3,"min_val":1,"max_val":15}]'::jsonb,

  -- Defaults as JSON
  '{"inlet_diameter":100,"throat_diameter":40,"exit_diameter":80,"length_converging":50,"length_diverging":100,"convergence_angle_deg":30,"divergence_angle_deg":15,"wall_thickness":3}'::jsonb,

  'Exit area > throat area. Convergence <= 60°. Divergence <= 45°.',
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


-- ─── Spring Grammar ────────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'spring',
  'Compression/Extension Spring',
  'Helical coil springs for mechanical energy storage. Compression, extension, and torsion types. Derives spring rate and solid length.',
  ARRAY['spring', 'coil spring', 'compression spring', 'extension spring', 'torsion spring', 'helical', 'mechanical', 'energy storage', 'suspension', 'shock', '应力', '弹簧', 'load deflection', 'spring rate', 'stiffness'],
  ARRAY[
    'Design a compression spring with 10 coils',
    'Create a 25mm OD spring with 80mm length',
    'Build an extension spring with hooks',
    'Make a torsion spring for 90 degree rotation',
    'Design a music wire spring with 2mm wire'
  ],
  $PYSPRING$
"""
ForgeOS Spring Grammar — Helical Coil Springs
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _calculate_spring_geometry(wire_diameter, outer_diameter, free_length, coil_count):
    """Calculate spring geometry parameters."""
    mean_diameter = outer_diameter - wire_diameter
    active_coils = coil_count - 2 if coil_count > 2 else coil_count
    
    # Spring index C = D/d (mean diameter / wire diameter)
    spring_index = mean_diameter / wire_diameter if wire_diameter > 0 else 1
    
    # Solid length (coils compressed fully)
    solid_length = coil_count * wire_diameter
    
    # Spring rate (stiffness) for compression spring
    # k = G*d^4 / (8*n*D^3) where G = shear modulus
    # Using G = 79 GPa for steel
    shear_modulus = 79000  # MPa
    spring_rate = (shear_modulus * wire_diameter**4) / (8 * active_coils * mean_diameter**3) if active_coils > 0 else 0
    
    return {
        "mean_diameter": mean_diameter,
        "active_coils": active_coils,
        "solid_length": solid_length,
        "spring_index": spring_index,
        "spring_rate": spring_rate,
    }

def _build_compression_spring(wire_diameter, outer_diameter, free_length, coil_count, end_type):
    """Build compression spring."""
    mean_diameter = outer_diameter - wire_diameter
    pitch = free_length / coil_count if coil_count > 0 else free_length
    
    # Build spring as helix
    points = []
    turns = coil_count
    segments = turns * 20  # 20 segments per turn
    
    for i in range(segments + 1):
        t = i / segments
        angle = t * turns * 2 * math.pi
        x = mean_diameter / 2 * math.cos(angle)
        y = mean_diameter / 2 * math.sin(angle)
        z = t * free_length
        points.append(cq.Vector(x, y, z))
    
    # Create spring using sweep
    path = cq.Workplane("XY")
    for i, pt in enumerate(points):
        if i == 0:
            path = path.moveTo(pt.x, pt.y)
        else:
            path = path.lineTo(pt.x, pt.y)
    
    # Circular cross-section for wire
    spring = cq.Workplane("YZ").circle(wire_diameter / 2).sweep(path, transition="round")
    
    # Add end coils (closer spacing)
    # Simplified: just return the main spring
    return spring

def _build_extension_spring(wire_diameter, outer_diameter, free_length, coil_count, end_type):
    """Build extension spring with hooks."""
    spring = _build_compression_spring(wire_diameter, outer_diameter, free_length, coil_count, end_type)
    
    # Add hooks at ends
    hook_size = outer_diameter * 0.8
    
    # Top hook
    top_hook = cq.Workplane("XY").circle(hook_size / 2).circle(wire_diameter).extrude(wire_diameter * 2)
    top_hook = top_hook.translate((0, 0, free_length))
    
    # Bottom hook
    bottom_hook = cq.Workplane("XY").circle(hook_size / 2).circle(wire_diameter).extrude(wire_diameter * 2)
    bottom_hook = bottom_hook.translate((0, 0, -wire_diameter * 2))
    
    return spring, top_hook, bottom_hook

def _check_spring_index(s):
    """Spring index C should be 4-25 for manufacturability."""
    geo = s.get("geometry", {})
    c = geo.get("spring_index", 0)
    if c < 4:
        return False, f"Spring index {c:.1f} < 4 (too tight, hard to manufacture)"
    if c > 25:
        return False, f"Spring index {c:.1f} > 25 (too loose, may buckle)"
    return True, ""

def _check_solid_length(s):
    """Solid length should be less than free length."""
    geo = s.get("geometry", {})
    solid = geo.get("solid_length", 0)
    free = s["free_length"]
    if solid > free:
        return False, f"Solid length {solid:.0f}mm > free length {free:.0f}mm (spring has negative travel)"
    return True, ""

class SpringGrammar(DomainGrammar):
    @property
    def name(self): return "spring"
    @property
    def display_name(self): return "Compression/Extension Spring"
    @property
    def description(self): return "Helical coil springs for mechanical energy storage"

    def param_specs(self):
        return [
            ParamSpec("spring_type", "enum", None, "Spring type", "compression", enum_options=["compression", "extension", "torsion"]),
            ParamSpec("wire_diameter", "float", "mm", "Wire/coil diameter", 2, 0.5, 15),
            ParamSpec("outer_diameter", "float", "mm", "Spring outer diameter", 25, 10, 100),
            ParamSpec("free_length", "float", "mm", "Spring free (uncompressed) length", 80, 20, 300),
            ParamSpec("coil_count", "int", None, "Number of active coils", 10, 3, 30),
            ParamSpec("end_type", "enum", None, "End coil configuration", "closed", enum_options=["closed", "open", "hooks", "pigtails"]),
            ParamSpec("material", "enum", None, "Spring material", "music_wire", enum_options=["music_wire", "stainless", "oil_tempered"]),
        ]

    def defaults(self):
        return {
            "spring_type": "compression", "wire_diameter": 2, "outer_diameter": 25,
            "free_length": 80, "coil_count": 10, "end_type": "closed", "material": "music_wire",
        }

    def constraints(self):
        return [
            Constraint("spring_index", "Spring index should be 4-25",
                lambda s: _check_spring_index(s), severity="warning"),
            Constraint("solid_length", "Solid length < free length",
                lambda s: _check_solid_length(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Calculate geometry
        s["geometry"] = _calculate_spring_geometry(
            s["wire_diameter"], s["outer_diameter"], s["free_length"], s["coil_count"]
        )
        
        # Material color
        if s["material"] == "music_wire":
            s["color"] = cq.Color(0.6, 0.6, 0.65)  # Bright steel
        elif s["material"] == "stainless":
            s["color"] = cq.Color(0.75, 0.75, 0.78)  # Stainless
        else:  # oil_tempered
            s["color"] = cq.Color(0.4, 0.35, 0.3)  # Darker spring
        
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Spring")
        
        color = s["color"]
        
        if s["spring_type"] == "compression":
            spring = _build_compression_spring(
                s["wire_diameter"], s["outer_diameter"],
                s["free_length"], s["coil_count"], s["end_type"]
            )
            assy.add(spring, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="CoilSpring")
            
        elif s["spring_type"] == "extension":
            spring, top_hook, bottom_hook = _build_extension_spring(
                s["wire_diameter"], s["outer_diameter"],
                s["free_length"], s["coil_count"], s["end_type"]
            )
            assy.add(spring, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="CoilSpring")
            assy.add(top_hook, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="TopHook")
            assy.add(bottom_hook, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="BottomHook")
            
        else:  # torsion
            # Simplified torsion spring as coil
            spring = _build_compression_spring(
                s["wire_diameter"], s["outer_diameter"],
                s["free_length"], s["coil_count"], s["end_type"]
            )
            spring = spring.rotate((0, 0, 0), (1, 0, 0), 90)
            assy.add(spring, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="TorsionSpring")
        
        return assy
$PYSPRING$,

  -- Core library
  $PYCORE_SPRING$
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
$PYCORE_SPRING$,

  -- Param specs as JSON
  '[{"name":"spring_type","type":"enum","unit":null,"description":"Spring type","default":"compression","enum_options":["compression","extension","torsion"]},{"name":"wire_diameter","type":"float","unit":"mm","description":"Wire/coil diameter","default":2,"min_val":0.5,"max_val":15},{"name":"outer_diameter","type":"float","unit":"mm","description":"Spring outer diameter","default":25,"min_val":10,"max_val":100},{"name":"free_length","type":"float","unit":"mm","description":"Spring free (uncompressed) length","default":80,"min_val":20,"max_val":300},{"name":"coil_count","type":"int","unit":null,"description":"Number of active coils","default":10,"min_val":3,"max_val":30},{"name":"end_type","type":"enum","unit":null,"description":"End coil configuration","default":"closed","enum_options":["closed","open","hooks","pigtails"]},{"name":"material","type":"enum","unit":null,"description":"Spring material","default":"music_wire","enum_options":["music_wire","stainless","oil_tempered"]}]'::jsonb,

  -- Defaults as JSON
  '{"spring_type":"compression","wire_diameter":2,"outer_diameter":25,"free_length":80,"coil_count":10,"end_type":"closed","material":"music_wire"}'::jsonb,

  'Spring index 4-25. Solid length < free length.',
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


-- ─── Container Grammar ────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'container',
  'Packaging Container with Lid',
  'Rectangular packaging containers with configurable lid types, corner radii, dividers, and handle styles. For storage and shipping.',
  ARRAY['container', 'box', 'packaging', 'storage box', 'tote', 'bin', 'crate', 'lid', 'container', 'packaging', 'shipping', 'dividers', 'partition', 'storage', 'organizer', 'cardboard', 'plastic container'],
  ARRAY[
    'Design a 200x150x100mm storage container',
    'Create a packaging box with dividers',
    'Build a container with hinged lid',
    'Make a container with rope handles',
    'Design a stackable container with snap lid'
  ],
  $PYCONTAINER$
"""
ForgeOS Container Grammar — Packaging and Storage Boxes
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

def _build_container_body(length, width, height, wall_thickness, corner_radius):
    """Build container box body with corner radius."""
    # Build as rounded box
    if corner_radius > 0:
        # Use fillet on edges
        body = cq.Workplane("XY").box(length - 2 * wall_thickness, width - 2 * wall_thickness, height)
        body = body.translate((0, 0, height / 2))
        
        # Add walls
        # Bottom
        bottom = cq.Workplane("XY").box(length, width, wall_thickness)
        
        # Sides
        left_side = cq.Workplane("XY").box(wall_thickness, width, height)
        left_side = left_side.translate((-length / 2 + wall_thickness / 2, 0, height / 2))
        
        right_side = left_side.translate((length - 2 * wall_thickness, 0, 0))
        
        front_side = cq.Workplane("XY").box(length - 2 * wall_thickness, wall_thickness, height)
        front_side = front_side.translate((0, -width / 2 + wall_thickness / 2, height / 2))
        
        back_side = front_side.translate((0, width - 2 * wall_thickness, 0))
        
        body = bottom.union(left_side).union(right_side).union(front_side).union(back_side)
    else:
        # Simple box
        body = cq.Workplane("XY").box(length, width, height)
        body = body.translate((0, 0, height / 2))
        
        # Hollow out
        inner = cq.Workplane("XY").box(
            length - 2 * wall_thickness,
            width - 2 * wall_thickness,
            height - wall_thickness
        )
        inner = inner.translate((0, 0, height / 2))
        body = body.cut(inner)
    
    return body

def _build_friction_lid(length, width, wall_thickness, lid_thickness):
    """Build friction-fit lid."""
    lid = cq.Workplane("XY").box(length + 2, width + 2, lid_thickness)
    lid = lid.translate((0, 0, -lid_thickness / 2))
    return lid

def _build_hinged_lid(length, width, height, wall_thickness, lid_thickness):
    """Build hinged lid."""
    # Lid as part of container
    lid = cq.Workplane("XY").box(length + 2, wall_thickness + 2, lid_thickness)
    lid = lid.translate((0, width / 2, height))
    return lid

def _build_snap_lid(length, width, wall_thickness, lid_thickness):
    """Build snap-fit lid with tabs."""
    lid = cq.Workplane("XY").box(length + 4, width + 4, lid_thickness)
    lid = lid.translate((0, 0, -lid_thickness / 2))
    
    # Add snap tabs
    tab_width = 10
    tab_height = wall_thickness + 2
    for x in [-length / 2 + tab_width, length / 2 - tab_width]:
        for y in [-width / 2 + tab_width, width / 2 - tab_width]:
            tab = cq.Workplane("XY").box(tab_width, tab_width, tab_height)
            tab = tab.translate((x, y, -lid_thickness - tab_height / 2))
            lid = lid.union(tab)
    
    return lid

def _build_dividers(length, width, height, wall_thickness, divider_count):
    """Build interior dividers."""
    dividers = []
    
    if divider_count < 1:
        return dividers
    
    # Calculate divider spacing
    # Assuming N dividers create N+1 compartments
    div_thickness = wall_thickness
    
    # Longitudinal dividers (along length)
    for i in range(divider_count):
        y = -width / 2 + (i + 1) * width / (divider_count + 1)
        div = cq.Workplane("XY").box(length - 2 * wall_thickness, div_thickness, height * 0.8)
        div = div.translate((0, y, height * 0.4 + wall_thickness))
        dividers.append(div)
    
    return dividers

def _build_handle(length, width, height, handle_style, wall_thickness):
    """Build handle based on style."""
    if handle_style == "none":
        return None
    
    handle_height = 30
    handle_width = 40
    
    if handle_style == "cutout":
        # Cutout in wall - no add, handled in body
        return None
    
    elif handle_style == "strap":
        # Strap handle on top
        strap = cq.Workplane("XY").box(handle_width, wall_thickness, 8)
        strap = strap.translate((0, width / 2, height + 4))
        return strap
    
    elif handle_style == "rope":
        # Rope handle - represented as cylinder
        rope = cq.Workplane("XY").cylinder(handle_height, 5)
        rope = rope.rotate((0, 0, 0), (1, 0, 0), 90)
        rope = rope.translate((0, width / 2 + 15, height + 20))
        return rope
    
    return None

def _check_wall_thickness(s):
    """Wall thickness should be reasonable for size."""
    vol = s["length"] * s["width"] * s["height"]
    wall = s["wall_thickness"]
    if wall < 1:
        return False, "Wall too thin (< 1mm) for most materials"
    if wall > 20:
        return False, "Wall too thick (> 20mm) - inefficient"
    return True, ""

def _check_dividers_fit(s):
    """Dividers should fit within container."""
    dividers = s.get("interior_dividers_count", 0)
    if dividers > 10:
        return False, f"Too many dividers ({dividers}) - max 10"
    return True, ""

class ContainerGrammar(DomainGrammar):
    @property
    def name(self): return "container"
    @property
    def display_name(self): return "Packaging Container with Lid"
    @property
    def description(self): return "Rectangular packaging containers with configurable lid and dividers"

    def param_specs(self):
        return [
            ParamSpec("length", "float", "mm", "Container interior length", 200, 50, 800),
            ParamSpec("width", "float", "mm", "Container interior width", 150, 50, 600),
            ParamSpec("height", "float", "mm", "Container interior height", 100, 30, 400),
            ParamSpec("wall_thickness", "float", "mm", "Wall thickness", 2, 1, 20),
            ParamSpec("lid_type", "enum", None, "Lid closure type", "friction_fit", enum_options=["friction_fit", "hinged", "snap", "shrink_wrap"]),
            ParamSpec("corner_radius", "float", "mm", "Corner radius (0 = sharp)", 4, 0, 30),
            ParamSpec("interior_dividers_count", "int", None, "Number of dividers", 4, 0, 10),
            ParamSpec("handle_style", "enum", None, "Handle type", "none", enum_options=["none", "cutout", "strap", "rope"]),
        ]

    def defaults(self):
        return {
            "length": 200, "width": 150, "height": 100,
            "wall_thickness": 2, "lid_type": "friction_fit",
            "corner_radius": 4, "interior_dividers_count": 4, "handle_style": "none",
        }

    def constraints(self):
        return [
            Constraint("wall_thickness", "Wall thickness 1-20mm",
                lambda s: _check_wall_thickness(s), severity="warning"),
            Constraint("dividers_fit", "Dividers max 10",
                lambda s: _check_dividers_fit(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Calculate lid thickness
        s["lid_thickness"] = max(2, s["wall_thickness"])
        
        # Calculate dividers
        s["dividers"] = _build_dividers(
            s["length"], s["width"], s["height"],
            s["wall_thickness"], s["interior_dividers_count"]
        )
        
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Container")
        
        # Cardboard/paperboard color
        color = cq.Color(0.75, 0.65, 0.5)
        
        # Build container body
        body = _build_container_body(
            s["length"], s["width"], s["height"],
            s["wall_thickness"], s["corner_radius"]
        )
        assy.add(body, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="ContainerBody")
        
        # Build lid
        if s["lid_type"] == "friction_fit":
            lid = _build_friction_lid(s["length"], s["width"], s["wall_thickness"], s["lid_thickness"])
        elif s["lid_type"] == "hinged":
            lid = _build_hinged_lid(s["length"], s["width"], s["height"], s["wall_thickness"], s["lid_thickness"])
        elif s["lid_type"] == "snap":
            lid = _build_snap_lid(s["length"], s["width"], s["wall_thickness"], s["lid_thickness"])
        else:  # shrink_wrap - minimal lid
            lid = _build_friction_lid(s["length"], s["width"], s["wall_thickness"], 1)
        
        assy.add(lid, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name="Lid")
        
        # Build dividers
        for i, div in enumerate(s.get("dividers", [])):
            assy.add(div, loc=cq.Location(cq.Vector(0, 0, 0)), color=color, name=f"Divider{i}")
        
        # Build handle
        handle = _build_handle(s["length"], s["width"], s["height"], s["handle_style"], s["wall_thickness"])
        if handle:
            handle_color = cq.Color(0.6, 0.5, 0.4)  # Slightly darker for handle
            assy.add(handle, loc=cq.Location(cq.Vector(0, 0, 0)), color=handle_color, name="Handle")
        
        return assy
$PYCONTAINER$,

  -- Core library
  $PYCORE_CONTAINER$
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
$PYCORE_CONTAINER$,

  -- Param specs as JSON
  '[{"name":"length","type":"float","unit":"mm","description":"Container interior length","default":200,"min_val":50,"max_val":800},{"name":"width","type":"float","unit":"mm","description":"Container interior width","default":150,"min_val":50,"max_val":600},{"name":"height","type":"float","unit":"mm","description":"Container interior height","default":100,"min_val":30,"max_val":400},{"name":"wall_thickness","type":"float","unit":"mm","description":"Wall thickness","default":2,"min_val":1,"max_val":20},{"name":"lid_type","type":"enum","unit":null,"description":"Lid closure type","default":"friction_fit","enum_options":["friction_fit","hinged","snap","shrink_wrap"]},{"name":"corner_radius","type":"float","unit":"mm","description":"Corner radius (0 = sharp)","default":4,"min_val":0,"max_val":30},{"name":"interior_dividers_count","type":"int","unit":null,"description":"Number of dividers","default":4,"min_val":0,"max_val":10},{"name":"handle_style","type":"enum","unit":null,"description":"Handle type","default":"none","enum_options":["none","cutout","strap","rope"]}]'::jsonb,

  -- Defaults as JSON
  '{"length":200,"width":150,"height":100,"wall_thickness":2,"lid_type":"friction_fit","corner_radius":4,"interior_dividers_count":4,"handle_style":"none"}'::jsonb,

  'Wall thickness 1-20mm. Dividers max 10.',
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
