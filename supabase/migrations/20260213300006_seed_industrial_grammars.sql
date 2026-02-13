-- ═══════════════════════════════════════════════════════════════
-- Seed CAD Grammars: Industrial Systems (Portal Frame, Conveyor, AMR, ASRS)
-- ═══════════════════════════════════════════════════════════════
-- Python source code is stored using dollar-quoting to avoid escaping.
-- The core_library_code is the base class framework (grammar.py).
-- The python_code is the domain-specific grammar.

-- ─── Portal Frame Grammar ─────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'portal_frame',
  'Steel Portal Frame Building',
  'Pre-engineered steel portal frame building. Configurable span, eave height, length, roof pitch, frame spacing with derived rafter, column, purlin, and girt dimensions.',
  ARRAY['portal frame', 'steel building', 'warehouse', 'industrial building', 'pre-engineered', 'portal frame', 'rafters', 'columns', 'purlins', 'girts', 'steel structure', 'cladding', 'structural steel', 'eave height', 'clear span'],
  ARRAY[
    'Design a 30m span portal frame warehouse',
    'Create a 6m eave height industrial building',
    'Build a 50m long steel portal frame with 10 degree roof',
    'Design a portal frame with W200x46 rafters',
    'Create a steel building with 6m frame spacing'
  ],
  $PYPORTAL$
"""
ForgeOS Portal Frame Grammar — Pre-Engineered Steel Buildings
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# Standard wide flange sections (mm) - weight kg/m, dimensions
W_SECTIONS = {
    "w150x24": {"depth": 152, "web_thickness": 6.1, "flange_width": 152, "flange_thickness": 9.4, "weight": 24},
    "w200x46": {"depth": 210, "web_thickness": 9.3, "flange_width": 165, "flange_thickness": 11.8, "weight": 46},
    "w250x58": {"depth": 260, "web_thickness": 10.4, "flange_width": 180, "flange_thickness": 14.7, "weight": 58},
    "w310x74": {"depth": 310, "web_thickness": 12.7, "flange_width": 200, "flange_thickness": 19.6, "weight": 74},
}

# Wind speed to pressure (Pa) - simplified ASCE/NZS conversion
WIND_PRESSURE = {
    50: 430, 60: 620, 70: 840, 80: 1100, 90: 1380, 100: 1700,
    110: 2060, 120: 2450, 130: 2890, 140: 3360, 150: 3870,
}

# Snow load to pressure (Pa)
SNOW_PRESSURE = {
    0.5: 500, 1.0: 1000, 1.5: 1500, 2.0: 2000, 2.5: 2500, 3.0: 3000,
}

def _build_i_section(depth, web_thickness, flange_width, flange_thickness, length):
    """Build I-shaped wide flange section."""
    # Web
    web = cq.Workplane("XY").box(length, web_thickness, depth)
    # Flanges
    flange1 = cq.Workplane("XY").box(length, flange_width, flange_thickness)
    flange1 = flange1.translate((0, 0, -depth/2 + flange_thickness/2))
    flange2 = cq.Workplane("XY").box(length, flange_width, flange_thickness)
    flange2 = flange2.translate((0, 0, depth/2 - flange_thickness/2))
    return web.union(flange1).union(flange2)

def _build_column(height, section_props):
    """Build portal frame column."""
    depth = section_props["depth"]
    web = section_props["web_thickness"]
    f_width = section_props["flange_width"]
    f_thick = section_props["flange_thickness"]
    return _build_i_section(depth, web, f_width, f_thick, height)

def _build_rafter(span, roof_pitch, section_props):
    """Build portal frame rafter."""
    depth = section_props["depth"]
    web = section_props["web_thickness"]
    f_width = section_props["flange_width"]
    f_thick = section_props["flange_thickness"]
    
    # Calculate rafter length accounting for pitch
    pitch_rad = math.radians(roof_pitch)
    rafter_length = (span / 2) / math.cos(pitch_rad)
    
    # Build rafter with pitch
    rafter = _build_i_section(depth, web, f_width, f_thick, rafter_length)
    # Rotate to match roof pitch
    rafter = rafter.rotate((0, 0, 0), (0, 1, 0), roof_pitch)
    return rafter

def _build_purlin(length, spacing):
    """Build Z-section purlin."""
    # Simplified Z-purlin shape
    purlin_height = 150
    web_thickness = 2.0
    flange_width = 50
    flange_thickness = 2.0
    
    # Z-section: top flange, web, bottom flange
    top_flange = cq.Workplane("XY").box(length, flange_width, flange_thickness)
    web = cq.Workplane("XY").box(length, web_thickness, purlin_height - 2*flange_thickness)
    web = web.translate((0, 0, -(purlin_height/2 - flange_thickness)))
    bot_flange = cq.Workplane("XY").box(length, flange_width, flange_thickness)
    bot_flange = bot_flange.translate((0, flange_width/2 + web_thickness/2, -purlin_height/2 + flange_thickness/2))
    
    return top_flange.union(web).union(bot_flange)

def _build_girt(length, spacing):
    """Build Z-section girt (wall purlin)."""
    return _build_purlin(length, spacing)  # Same as purlin

def _check_span_limits(s):
    """Portal frame span should be reasonable."""
    span = s["span"]
    if span < 10:
        return False, f"Span {span}m too small (min 10m for portal frame)"
    if span > 80:
        return False, f"Span {span}m exceeds typical portal frame limits (max 80m)"
    return True, ""

def _check_eave_to_span(s):
    """Eave height should be reasonable relative to span."""
    ratio = s["eave_height"] / s["span"]
    if ratio > 0.6:
        return False, f"Eave/span ratio {ratio:.2f} > 0.6 (consider rigid frame)"
    return True, ""

class PortalFrameGrammar(DomainGrammar):
    @property
    def name(self): return "portal_frame"
    @property
    def display_name(self): return "Steel Portal Frame Building"
    @property
    def description(self): return "Pre-engineered steel portal frame building"

    def param_specs(self):
        return [
            ParamSpec("span", "float", "m", "Building width (clear span)", 30, 10, 80),
            ParamSpec("eave_height", "float", "m", "Wall height at gutter", 6, 3, 15),
            ParamSpec("length", "float", "m", "Building length", 50, 10, 200),
            ParamSpec("roof_pitch_deg", "float", "degrees", "Roof pitch angle", 10, 5, 25),
            ParamSpec("frame_spacing", "float", "m", "Distance between frames", 6, 4, 12),
            ParamSpec("rafter_section", "enum", None, "Rafter wide flange section", "w200x46", enum_options=["w150x24", "w200x46", "w250x58", "w310x74", "custom"]),
            ParamSpec("column_section", "enum", None, "Column wide flange section", "w200x46", enum_options=["w150x24", "w200x46", "w250x58", "w310x74", "custom"]),
            ParamSpec("purlin_spacing", "float", "m", "Purlin spacing on roof", 1.2, 0.6, 2.0),
            ParamSpec("girt_spacing", "float", "m", "Girt spacing on walls", 1.5, 0.6, 2.5),
            ParamSpec("wind_speed_kmh", "int", "km/h", "Design wind speed", 100, 50, 150),
            ParamSpec("snow_load_kPa", "float", "kPa", "Design snow load", 1.0, 0.0, 3.0),
        ]

    def defaults(self):
        return {
            "span": 30, "eave_height": 6, "length": 50, "roof_pitch_deg": 10,
            "frame_spacing": 6, "rafter_section": "w200x46", "column_section": "w200x46",
            "purlin_spacing": 1.2, "girt_spacing": 1.5, "wind_speed_kmh": 100, "snow_load_kPa": 1.0,
        }

    def constraints(self):
        return [
            Constraint("span_limits", "Span 10-80m for portal frames",
                lambda s: _check_span_limits(s), severity="error"),
            Constraint("eave_span_ratio", "Eave/span ratio should be <= 0.6",
                lambda s: _check_eave_to_span(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Get section properties
        s["rafter_props"] = W_SECTIONS.get(s["rafter_section"], W_SECTIONS["w200x46"])
        s["column_props"] = W_SECTIONS.get(s["column_section"], W_SECTIONS["w200x46"])
        
        # Calculate derived values
        s["rafter_length"] = (s["span"] / 2) / math.cos(math.radians(s["roof_pitch_deg"]))
        s["column_height"] = s["eave_height"]
        
        # Number of frames
        s["frame_count"] = int(s["length"] / s["frame_spacing"]) + 1
        
        # Number of purlins per rafter
        s["purlin_count"] = int(s["rafter_length"] / s["purlin_spacing"]) + 1
        
        # Number of girts per column
        s["girt_count"] = int(s["eave_height"] / s["girt_spacing"]) + 1
        
        # Wind and snow loads (simplified)
        s["wind_pressure"] = WIND_PRESSURE.get(s["wind_speed_kmh"], 1000)
        s["snow_pressure"] = SNOW_PRESSURE.get(s["snow_load_kPa"], 1000)
        
        return s

    def build(self, skeleton):
        s = skeleton
        
        assy = cq.Assembly(name="ForgeOS_PortalFrame")
        
        frame_spacing = s["frame_spacing"]
        span = s["span"]
        eave_height = s["eave_height"]
        length = s["length"]
        roof_pitch = s["roof_pitch_deg"]
        
        column_props = s["column_props"]
        rafter_props = s["rafter_props"]
        
        # Build frames
        for i in range(s["frame_count"]):
            z_pos = i * frame_spacing - length / 2
            
            # Column (left)
            col_left = _build_column(eave_height, column_props)
            col_left = col_left.translate((-span/2, 0, eave_height/2))
            assy.add(col_left, loc=cq.Location(cq.Vector(z_pos, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name=f"ColumnLeft{i+1}")
            
            # Column (right)
            col_right = _build_column(eave_height, column_props)
            col_right = col_right.translate((span/2, 0, eave_height/2))
            assy.add(col_right, loc=cq.Location(cq.Vector(z_pos, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name=f"ColumnRight{i+1}")
            
            # Rafter (left side)
            rafter_left = _build_rafter(span, roof_pitch, rafter_props)
            rafter_left = rafter_left.translate((0, 0, eave_height))
            rafter_left = rafter_left.rotate((0, 0, 0), (0, 1, 0), 180)
            rafter_left = rafter_left.translate((-span/4, 0, 0))
            assy.add(rafter_left, loc=cq.Location(cq.Vector(z_pos, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name=f"RafterLeft{i+1}")
            
            # Rafter (right side)
            rafter_right = _build_rafter(span, roof_pitch, rafter_props)
            rafter_right = rafter_right.translate((span/4, 0, eave_height))
            assy.add(rafter_right, loc=cq.Location(cq.Vector(z_pos, 0, 0)), color=cq.Color(0.5, 0.5, 0.55), name=f"RafterRight{i+1}")
        
        # Add purlins along rafters
        for i in range(s["frame_count"] - 1):
            z_pos = i * frame_spacing + frame_spacing / 2 - length / 2
            
            for j in range(min(s["purlin_count"], 10)):
                purlin_x = -s["rafter_length"]/2 + j * s["purlin_spacing"]
                purlin_z = eave_height + purlin_x * math.tan(math.radians(roof_pitch))
                purlin = _build_purlin(frame_spacing, s["purlin_spacing"])
                purlin = purlin.rotate((0, 0, 0), (1, 0, 0), roof_pitch)
                assy.add(purlin, loc=cq.Location(cq.Vector(purlin_x, z_pos, purlin_z)), color=cq.Color(0.6, 0.6, 0.65), name=f"Purlin{i}_{j}")
        
        # Add girts on walls
        for i in range(s["frame_count"]):
            z_pos = i * frame_spacing - length / 2
            
            for j in range(min(s["girt_count"], 6)):
                girt_y = -eave_height/2 + j * s["girt_spacing"] + s["girt_spacing"]
                
                # Front wall girt
                girt_front = _build_girt(frame_spacing, s["girt_spacing"])
                girt_front = girt_front.translate((span/2, 0, girt_y + eave_height/2))
                assy.add(girt_front, loc=cq.Location(cq.Vector(z_pos, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name=f"GirtFront{i}_{j}")
                
                # Back wall girt
                girt_back = _build_girt(frame_spacing, s["girt_spacing"])
                girt_back = girt_back.translate((-span/2, 0, girt_y + eave_height/2))
                assy.add(girt_back, loc=cq.Location(cq.Vector(z_pos, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name=f"GirtBack{i}_{j}")
        
        return assy
$PYPORTAL$,

  -- Core library
  $PYCORE_PORTAL$
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
$PYCORE_PORTAL$,

  -- Param specs as JSON
  '[{"name":"span","type":"float","unit":"m","description":"Building width (clear span)","default":30,"min_val":10,"max_val":80},{"name":"eave_height","type":"float","unit":"m","description":"Wall height at gutter","default":6,"min_val":3,"max_val":15},{"name":"length","type":"float","unit":"m","description":"Building length","default":50,"min_val":10,"max_val":200},{"name":"roof_pitch_deg","type":"float","unit":"degrees","description":"Roof pitch angle","default":10,"min_val":5,"max_val":25},{"name":"frame_spacing","type":"float","unit":"m","description":"Distance between frames","default":6,"min_val":4,"max_val":12},{"name":"rafter_section","type":"enum","unit":null,"description":"Rafter wide flange section","default":"w200x46","enum_options":["w150x24","w200x46","w250x58","w310x74","custom"]},{"name":"column_section","type":"enum","unit":null,"description":"Column wide flange section","default":"w200x46","enum_options":["w150x24","w200x46","w250x58","w310x74","custom"]},{"name":"purlin_spacing","type":"float","unit":"m","description":"Purlin spacing on roof","default":1.2,"min_val":0.6,"max_val":2.0},{"name":"girt_spacing","type":"float","unit":"m","description":"Girt spacing on walls","default":1.5,"min_val":0.6,"max_val":2.5},{"name":"wind_speed_kmh","type":"int","unit":"km/h","description":"Design wind speed","default":100,"min_val":50,"max_val":150},{"name":"snow_load_kPa","type":"float","unit":"kPa","description":"Design snow load","default":1.0,"min_val":0.0,"max_val":3.0}]'::jsonb,

  -- Defaults as JSON
  '{"span":30,"eave_height":6,"length":50,"roof_pitch_deg":10,"frame_spacing":6,"rafter_section":"w200x46","column_section":"w200x46","purlin_spacing":1.2,"girt_spacing":1.5,"wind_speed_kmh":100,"snow_load_kPa":1.0}'::jsonb,

  'Span 10-80m for portal frames. Eave/span ratio <= 0.6.',
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


-- ─── Conveyor Belt Grammar ───────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'conveyor_belt',
  'Conveyor Belt System',
  'Industrial conveyor belt systems. Supports belt, roller, chain, and modular belt types with configurable length, width, speed, and support structure.',
  ARRAY['conveyor', 'belt conveyor', 'roller conveyor', 'chain conveyor', 'material handling', 'conveyor system', 'conveyor belt', 'industrial conveyor', 'transfer line', 'sortation', 'powered roller', 'belt drive', 'conveyor frame', 'conveyor leg', 'conveyor support'],
  ARRAY[
    'Design a 10m belt conveyor with 600mm width',
    'Create a roller conveyor for package handling',
    'Build a 5-degree incline conveyor system',
    'Design a conveyor with truss supports',
    'Create a conveyor with 1m/s belt speed'
  ],
  $PYCONVEYOR$
"""
ForgeOS Conveyor Belt Grammar — Material Handling Systems
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# Material colors
FRAME_COLOR = cq.Color(0.4, 0.4, 0.45)
BELT_COLOR = cq.Color(0.15, 0.15, 0.2)
ROLLER_COLOR = cq.Color(0.5, 0.5, 0.55)
LEG_COLOR = cq.Color(0.6, 0.5, 0.3)

def _build_belt(length, width, thickness):
    """Build conveyor belt."""
    belt = cq.Workplane("XY").box(length, width, thickness)
    return belt

def _build_belt_frame(length, width, height, frame_material):
    """Build conveyor frame."""
    frame_thickness = 3 if frame_material == "steel" else 2
    side_height = height - 20
    
    # Side rails
    left_rail = cq.Workplane("XY").box(length, frame_thickness, side_height)
    left_rail = left_rail.translate((0, -width/2 + frame_thickness/2, side_height/2))
    
    right_rail = cq.Workplane("XY").box(length, frame_thickness, side_height)
    right_rail = right_rail.translate((0, width/2 - frame_thickness/2, side_height/2))
    
    # Cross members
    cross_count = max(int(length / 500), 3)
    cross_members = []
    for i in range(cross_count):
        x = -length/2 + (i + 0.5) * length / cross_count
        cross = cq.Workplane("XY").box(frame_thickness, width - 20, frame_thickness)
        cross = cross.translate((x, 0, frame_thickness/2))
        cross_members.append(cross)
    
    frame = left_rail.union(right_rail)
    for cross in cross_members:
        frame = frame.union(cross)
    
    return frame

def _build_rollers(length, width, roller_diameter, spacing):
    """Build roller conveyor section."""
    roller_length = width - 10
    roller_count = int(length / spacing) + 1
    
    rollers = []
    for i in range(roller_count):
        x = -length/2 + (i + 0.5) * length / roller_count
        roller = cq.Workplane("XY").cylinder(roller_diameter/2, roller_length)
        roller = roller.rotate((0, 0, 0), (1, 0, 0), 90)
        roller = roller.translate((x, 0, roller_diameter/2 + 10))
        rollers.append(roller)
    
    result = rollers[0]
    for roller in rollers[1:]:
        result = result.union(roller)
    
    return result

def _build_truss(length, height, span):
    """Build truss support structure."""
    truss = None
    bay_count = max(int(length / 1000), 4)
    bay_length = length / bay_count
    
    for bay in range(bay_count):
        x = -length/2 + bay * bay_length + bay_length/2
        
        # Simple triangular truss
        top = cq.Workplane("XY").box(bay_length - 10, 30, 5)
        bottom = cq.Workplane("XY").box(bay_length - 10, 30, 5)
        bottom = bottom.translate((0, 0, height))
        
        # Diagonal bracing
        diag1 = cq.Workplane("XY").box(5, 30, math.sqrt(bay_length**2 + height**2) * 0.7)
        angle = math.degrees(math.atan2(height, bay_length))
        diag1 = diag1.rotate((0, 0, 0), (0, 1, 0), -angle)
        diag1 = diag1.translate((x, 0, height/2))
        
        diag2 = cq.Workplane("XY").box(5, 30, math.sqrt(bay_length**2 + height**2) * 0.7)
        diag2 = diag2.rotate((0, 0, 0), (0, 1, 0), angle)
        diag2 = diag2.translate((x, 0, height/2))
        
        if truss is None:
            truss = top.union(bottom).union(diag1).union(diag2)
        else:
            truss = truss.union(top).union(bottom).union(diag1).union(diag2)
    
    return truss

def _build_leg(height, width):
    """Build conveyor support leg."""
    leg = cq.Workplane("XY").box(80, 10, height)
    foot = cq.Workplane("XY").box(100, 80, 5)
    foot = foot.translate((0, 0, -height/2 + 2.5))
    return leg.union(foot)

def _build_drive_unit(length, width, motor_position):
    """Build drive unit for conveyor."""
    # Motor housing
    motor_box = cq.Workplane("XY").box(200, width + 40, 150)
    motor_box = motor_box.translate((0, 0, 75))
    
    # Discharge pulley
    pulley = cq.Workplane("XY").cylinder(width/2 + 20, 80)
    pulley = pulley.rotate((0, 0, 0), (1, 0, 0), 90)
    pulley = pulley.translate((length/2 - 50, 0, 30))
    
    return motor_box.union(pulley)

def _check_incline_angle(s):
    """Incline angle should be reasonable for belt conveyors."""
    if s["conveyor_type"] == "belt" and s["incline_angle_deg"] > 18:
        return False, f"Incline {s['incline_angle_deg']}° > 18° may cause material roll-back"
    return True, ""

def _check_speed_capacity(s):
    """Belt speed and capacity should be compatible."""
    speed = s["belt_speed_mps"]
    capacity = s["load_capacity_kgpm"]
    width = s["belt_width"]
    
    # Rough check: max capacity based on width and speed
    max_capacity = width * speed * 50  # kg/min
    if capacity > max_capacity * 1.5:
        return False, f"Capacity {capacity}kg/m may exceed {width}mm x {speed}m/s belt capacity"
    return True, ""

class ConveyorBeltGrammar(DomainGrammar):
    @property
    def name(self): return "conveyor_belt"
    @property
    def display_name(self): return "Conveyor Belt System"
    @property
    def description(self): return "Industrial conveyor belt systems"

    def param_specs(self):
        return [
            ParamSpec("conveyor_type", "enum", None, "Conveyor type", "belt", enum_options=["belt", "roller", "chain", "modular"]),
            ParamSpec("length", "float", "m", "Conveyor length", 10, 2, 50),
            ParamSpec("belt_width", "float", "mm", "Belt or roller width", 600, 300, 1200),
            ParamSpec("belt_thickness", "float", "mm", "Belt thickness (belt type)", 5, 3, 15),
            ParamSpec("incline_angle_deg", "float", "degrees", "Incline angle", 0, 0, 25),
            ParamSpec("roller_diameter", "float", "mm", "Roller diameter (roller type)", 50, 30, 100),
            ParamSpec("belt_speed_mps", "float", "m/s", "Belt linear speed", 1.0, 0.1, 5.0),
            ParamSpec("load_capacity_kgpm", "float", "kg/m", "Load capacity per meter", 50, 10, 200),
            ParamSpec("frame_material", "enum", None, "Frame material", "steel", enum_options=["steel", "aluminum", "stainless"]),
            ParamSpec("support_structure", "enum", None, "Support structure type", "truss", enum_options=["truss", "channel", "stand"]),
            ParamSpec("leg_spacing", "float", "m", "Leg/support spacing", 2, 1, 4),
            ParamSpec("motor_position", "enum", None, "Motor/drive position", "head", enum_options=["head", "tail", "intermediate"]),
        ]

    def defaults(self):
        return {
            "conveyor_type": "belt", "length": 10, "belt_width": 600, "belt_thickness": 5,
            "incline_angle_deg": 0, "roller_diameter": 50, "belt_speed_mps": 1.0,
            "load_capacity_kgpm": 50, "frame_material": "steel", "support_structure": "truss",
            "leg_spacing": 2, "motor_position": "head",
        }

    def constraints(self):
        return [
            Constraint("incline_angle", "Belt incline <= 18 degrees",
                lambda s: _check_incline_angle(s), severity="error"),
            Constraint("speed_capacity", "Capacity compatible with belt width/speed",
                lambda s: _check_speed_capacity(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Height at discharge (based on incline)
        s["discharge_height"] = s["length"] * math.tan(math.radians(s["incline_angle_deg"]))
        s["frame_height"] = 500 + s["discharge_height"]  # Standard frame height + incline
        
        # Number of legs
        s["leg_count"] = int(s["length"] / s["leg_spacing"]) + 2
        
        # Convert units
        s["length_mm"] = s["length"] * 1000
        s["width_mm"] = s["belt_width"]
        
        return s

    def build(self, skeleton):
        s = skeleton
        
        assy = cq.Assembly(name="ForgeOS_Conveyor")
        
        length = s["length_mm"]
        width = s["width_mm"]
        height = s["frame_height"]
        conveyor_type = s["conveyor_type"]
        
        # Build frame
        frame = _build_belt_frame(length, width, height, s["frame_material"])
        frame = frame.rotate((0, 0, 0), (1, 0, 0), s["incline_angle_deg"])
        assy.add(frame, loc=cq.Location(cq.Vector(0, 0, 0)), color=FRAME_COLOR, name="ConveyorFrame")
        
        # Build belt or rollers
        if conveyor_type == "belt":
            belt = _build_belt(length, width, s["belt_thickness"])
            belt = belt.translate((0, 0, height - 50))
            belt = belt.rotate((0, 0, 0), (1, 0, 0), s["incline_angle_deg"])
            assy.add(belt, loc=cq.Location(cq.Vector(0, 0, 0)), color=BELT_COLOR, name="ConveyorBelt")
        elif conveyor_type == "roller":
            rollers = _build_rollers(length, width, s["roller_diameter"], s["leg_spacing"] * 500)
            rollers = rollers.rotate((0, 0, 0), (1, 0, 0), s["incline_angle_deg"])
            assy.add(rollers, loc=cq.Location(cq.Vector(0, 0, height/2)), color=ROLLER_COLOR, name="Rollers")
        
        # Build support structure
        if s["support_structure"] == "truss":
            truss = _build_truss(length, height - 100, s["leg_spacing"] * 1000)
            truss = truss.rotate((0, 0, 0), (1, 0, 0), s["incline_angle_deg"])
            assy.add(truss, loc=cq.Location(cq.Vector(0, 0, 0)), color=LEG_COLOR, name="TrussSupport")
        
        # Build legs
        leg_spacing_mm = s["leg_spacing"] * 1000
        for i in range(s["leg_count"]):
            x = -length/2 + i * leg_spacing_mm
            leg = _build_leg(height, width)
            leg = leg.rotate((0, 0, 0), (1, 0, 0), s["incline_angle_deg"])
            assy.add(leg, loc=cq.Location(cq.Vector(x, 0, 0)), color=LEG_COLOR, name=f"Leg{i+1}")
        
        # Build drive unit
        if s["motor_position"] == "head":
            drive = _build_drive_unit(length, width, s["motor_position"])
            drive = drive.rotate((0, 0, 0), (1, 0, 0), s["incline_angle_deg"])
            assy.add(drive, loc=cq.Location(cq.Vector(length/2 - 100, 0, 0)), color=cq.Color(0.3, 0.3, 0.35), name="DriveUnit")
        
        return assy
$PYCONVEYOR$,

  -- Core library
  $PYCORE_CONVEYOR$
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
$PYCORE_CONVEYOR$,

  -- Param specs as JSON
  '[{"name":"conveyor_type","type":"enum","unit":null,"description":"Conveyor type","default":"belt","enum_options":["belt","roller","chain","modular"]},{"name":"length","type":"float","unit":"m","description":"Conveyor length","default":10,"min_val":2,"max_val":50},{"name":"belt_width","type":"float","unit":"mm","description":"Belt or roller width","default":600,"min_val":300,"max_val":1200},{"name":"belt_thickness","type":"float","unit":"mm","description":"Belt thickness (belt type)","default":5,"min_val":3,"max_val":15},{"name":"incline_angle_deg","type":"float","unit":"degrees","description":"Incline angle","default":0,"min_val":0,"max_val":25},{"name":"roller_diameter","type":"float","unit":"mm","description":"Roller diameter (roller type)","default":50,"min_val":30,"max_val":100},{"name":"belt_speed_mps","type":"float","unit":"m/s","description":"Belt linear speed","default":1.0,"min_val":0.1,"max_val":5.0},{"name":"load_capacity_kgpm","type":"float","unit":"kg/m","description":"Load capacity per meter","default":50,"min_val":10,"max_val":200},{"name":"frame_material","type":"enum","unit":null,"description":"Frame material","default":"steel","enum_options":["steel","aluminum","stainless"]},{"name":"support_structure","type":"enum","unit":null,"description":"Support structure type","default":"truss","enum_options":["truss","channel","stand"]},{"name":"leg_spacing","type":"float","unit":"m","description":"Leg/support spacing","default":2,"min_val":1,"max_val":4},{"name":"motor_position","type":"enum","unit":null,"description":"Motor/drive position","default":"head","enum_options":["head","tail","intermediate"]}]'::jsonb,

  -- Defaults as JSON
  '{"conveyor_type":"belt","length":10,"belt_width":600,"belt_thickness":5,"incline_angle_deg":0,"roller_diameter":50,"belt_speed_mps":1.0,"load_capacity_kgpm":50,"frame_material":"steel","support_structure":"truss","leg_spacing":2,"motor_position":"head"}'::jsonb,

  'Belt incline <= 18 degrees. Capacity compatible with belt width/speed.',
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


-- ─── AMR (Autonomous Mobile Robot) Grammar ─────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'amr',
  'Autonomous Mobile Robot Base',
  'AMR (Autonomous Mobile Robot) base platform. Configurable wheel type, size, payload capacity, battery, and sensor configuration for warehouse and logistics.',
  ARRAY['amr', 'autonomous mobile robot', 'agv', 'mobile robot', 'warehouse robot', 'logistics robot', 'robot base', 'mecanum wheel', 'omni wheel', 'differential drive', 'robot platform', 'payload platform', 'delivery robot', ' AMR', 'autonomous robot', 'robot chassis'],
  ARRAY[
    'Design an 800x600mm AMR base with mecanum wheels',
    'Create a 200kg payload robot platform',
    'Build an AMR with lithium battery and full SLAM sensors',
    'Design a warehouse robot with 6km/h max speed',
    'Create a robot base with 150mm wheel diameter'
  ],
  $PYAMR$
"""
ForgeOS AMR Grammar — Autonomous Mobile Robot Platforms
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# Wheel configurations
WHEEL_SPECS = {
    "mecanum": {"diameter": 150, "width": 50, "roller_angle": 45},
    "omni": {"diameter": 100, "width": 40, "roller_angle": 0},
    "differential": {"diameter": 150, "width": 50, "roller_angle": 0},
    "skid_steer": {"diameter": 200, "width": 80, "roller_angle": 0},
}

# Battery specs
BATTERY_SPECS = {
    "lithium_ion": {"voltage": 48, "capacity_ah": 50, "weight_kg": 15, "color": (0.2, 0.6, 0.2)},
    "lead_acid": {"voltage": 24, "capacity_ah": 100, "weight_kg": 30, "color": (0.3, 0.3, 0.3)},
    "lithium_iron_phosphate": {"voltage": 48, "capacity_ah": 40, "weight_kg": 12, "color": (0.2, 0.5, 0.3)},
}

# Sensor configurations
SENSOR_CONFIGS = {
    "basic": {"lidar": False, "camera_count": 0, "ultrasonic": 2},
    "navigation": {"lidar": True, "camera_count": 2, "ultrasonic": 4},
    "full_slam": {"lidar": True, "camera_count": 4, "ultrasonic": 8},
}

BASE_COLOR = cq.Color(0.3, 0.3, 0.35)
WHEEL_COLOR = cq.Color(0.2, 0.2, 0.25)
ACCENT_COLOR = cq.Color(0.0, 0.6, 0.9)

def _build_base_platform(length, width, height):
    """Build AMR base platform."""
    # Main platform
    platform = cq.Workplane("XY").box(length, width, height)
    
    # Add rounded edges
    corner_r = 20
    corner1 = cq.Workplane("XY").cylinder(corner_r, height).translate((-length/2 + corner_r, -width/2 + corner_r, 0))
    corner2 = cq.Workplane("XY").cylinder(corner_r, height).translate((length/2 - corner_r, -width/2 + corner_r, 0))
    corner3 = cq.Workplane("XY").cylinder(corner_r, height).translate((-length/2 + corner_r, width/2 - corner_r, 0))
    corner4 = cq.Workplane("XY").cylinder(corner_r, height).translate((length/2 - corner_r, width/2 - corner_r, 0))
    
    platform = platform.union(corner1).union(corner2).union(corner3).union(corner4)
    
    return platform

def _build_wheel(wheel_type, diameter, width):
    """Build wheel assembly."""
    if wheel_type == "mecanum":
        # Mecanum wheel with rollers
        hub = cq.Workplane("XY").cylinder(diameter/3, width)
        rim = cq.Workplane("XY").cylinder(diameter/2, width/3)
        rim = rim.cut(hub)
        
        # Add rollers around circumference
        roller_count = 8
        for i in range(roller_count):
            angle = (2 * math.pi * i) / roller_count
            roller = cq.Workplane("XY").cylinder(diameter/6, width/2)
            roller = roller.rotate((0, 0, 0), (1, 0, 0), 90)
            roller = roller.translate((diameter/3 * math.cos(angle), diameter/3 * math.sin(angle), 0))
            hub = hub.union(roller)
        
        return hub
    else:
        # Standard wheel
        return cq.Workplane("XY").cylinder(diameter/2, width)

def _build_mount_plate(length, width):
    """Build equipment mount plate."""
    plate = cq.Workplane("XY").box(length - 20, width - 20, 10)
    # Add mounting holes
    for x in [-1, 1]:
        for y in [-1, 1]:
            hole = cq.Workplane("XY").circle(6).extrude(20)
            plate = plate.cut(hole.translate((x * (length/2 - 15), y * (width/2 - 15), 0)))
    return plate

def _build_battery(battery_type):
    """Build battery pack."""
    spec = BATTERY_SPECS.get(battery_type, BATTERY_SPECS["lithium_ion"])
    batt = cq.Workplane("XY").box(300, 200, 80)
    return batt

def _build_lidar():
    """Build LiDAR sensor unit."""
    lidar = cq.Workplane("XY").cylinder(40, 30)
    lidar = lidar.translate((0, 0, 15))
    return lidar

def _build_camera():
    """Build camera module."""
    cam = cq.Workplane("XY").box(30, 30, 20)
    lens = cq.Workplane("XY").cylinder(10, 5)
    lens = lens.translate((0, 0, 15))
    return cam.union(lens)

def _check_wheel_count(s):
    """Wheel count should match wheel type capabilities."""
    count = s["wheel_count"]
    wheel_type = s["wheel_type"]
    
    if wheel_type == "mecanum" and count != 4:
        return False, "Mecanum wheels typically use 4 wheels"
    if wheel_type == "differential" and count < 2:
        return False, "Differential drive requires at least 2 wheels"
    return True, ""

def _check_payload_wheel_size(s):
    """Payload capacity should be compatible with wheel size."""
    payload = s["payload_capacity_kg"]
    wheel_dia = s["wheel_diameter"]
    
    # Rough guide: each 50mm wheel diameter supports ~50kg
    max_payload = wheel_dia * 2
    if payload > max_payload * 1.5:
        return False, f"Payload {payload}kg may exceed wheel capacity for {wheel_dia}mm wheels"
    return True, ""

class AMRGrammar(DomainGrammar):
    @property
    def name(self): return "amr"
    @property
    def display_name(self): return "Autonomous Mobile Robot Base"
    @property
    def description(self): return "AMR base platform for logistics and warehouse"

    def param_specs(self):
        return [
            ParamSpec("base_length", "float", "mm", "Base platform length", 800, 400, 1500),
            ParamSpec("base_width", "float", "mm", "Base platform width", 600, 300, 1000),
            ParamSpec("base_height", "float", "mm", "Base platform height", 300, 150, 500),
            ParamSpec("wheel_type", "enum", None, "Wheel type", "mecanum", enum_options=["mecanum", "omni", "differential", "skid_steer"]),
            ParamSpec("wheel_diameter", "float", "mm", "Wheel diameter", 150, 80, 250),
            ParamSpec("wheel_count", "int", None, "Number of wheels", 4, 3, 6),
            ParamSpec("ground_clearance", "float", "mm", "Ground clearance", 50, 20, 100),
            ParamSpec("max_speed_kmh", "float", "km/h", "Maximum speed", 6, 1, 20),
            ParamSpec("payload_capacity_kg", "float", "kg", "Payload capacity", 200, 50, 1000),
            ParamSpec("battery_type", "enum", None, "Battery chemistry", "lithium_ion", enum_options=["lithium_ion", "lead_acid", "lithium_iron_phosphate"]),
            ParamSpec("charging_method", "enum", None, "Charging method", "automatic_dock", enum_options=["automatic_dock", "manual_swap", "opportunity_charge"]),
            ParamSpec("sensor_configuration", "enum", None, "Sensor configuration", "full_slam", enum_options=["basic", "navigation", "full_slam"]),
        ]

    def defaults(self):
        return {
            "base_length": 800, "base_width": 600, "base_height": 300,
            "wheel_type": "mecanum", "wheel_diameter": 150, "wheel_count": 4,
            "ground_clearance": 50, "max_speed_kmh": 6, "payload_capacity_kg": 200,
            "battery_type": "lithium_ion", "charging_method": "automatic_dock",
            "sensor_configuration": "full_slam",
        }

    def constraints(self):
        return [
            Constraint("wheel_count_type", "Wheel count compatible with wheel type",
                lambda s: _check_wheel_count(s), severity="error"),
            Constraint("payload_wheel_size", "Payload compatible with wheel size",
                lambda s: _check_payload_wheel_size(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Get wheel specs
        wheel_spec = WHEEL_SPECS.get(s["wheel_type"], WHEEL_SPECS["mecanum"])
        s["wheel_spec"] = wheel_spec
        
        # Get battery specs
        s["battery_spec"] = BATTERY_SPECS.get(s["battery_type"], BATTERY_SPECS["lithium_ion"])
        
        # Get sensor specs
        s["sensor_spec"] = SENSOR_CONFIGS.get(s["sensor_configuration"], SENSOR_CONFIGS["full_slam"])
        
        # Calculate wheel positions
        wheel_offset_x = s["base_length"] / 2 - 50
        wheel_offset_y = s["base_width"] / 2 - 30
        s["wheel_positions"] = [
            (wheel_offset_x, wheel_offset_y),
            (wheel_offset_x, -wheel_offset_y),
            (-wheel_offset_x, wheel_offset_y),
            (-wheel_offset_x, -wheel_offset_y),
        ]
        
        # Calculate center of gravity
        s["cog_height"] = s["base_height"] / 2
        
        return s

    def build(self, skeleton):
        s = skeleton
        
        assy = cq.Assembly(name="ForgeOS_AMR")
        
        # Build base platform
        base = _build_base_platform(s["base_length"], s["base_width"], s["base_height"])
        base = base.translate((0, 0, s["ground_clearance"] + s["wheel_diameter"]/2 + s["base_height"]/2))
        assy.add(base, loc=cq.Location(cq.Vector(0, 0, 0)), color=BASE_COLOR, name="BasePlatform")
        
        # Build wheels
        wheel_positions = s["wheel_positions"][:s["wheel_count"]]
        for i, (wx, wy) in enumerate(wheel_positions):
            wheel = _build_wheel(s["wheel_type"], s["wheel_diameter"], 40)
            wheel = wheel.rotate((0, 0, 0), (1, 0, 0), 90)
            wheel = wheel.translate((wx, wy, s["wheel_diameter"]/2 + s["ground_clearance"]))
            assy.add(wheel, loc=cq.Location(cq.Vector(0, 0, 0)), color=WHEEL_COLOR, name=f"Wheel{i+1}")
        
        # Build mount plate
        mount = _build_mount_plate(s["base_length"], s["base_width"])
        mount = mount.translate((0, 0, s["ground_clearance"] + s["wheel_diameter"] + s["base_height"] + 5))
        assy.add(mount, loc=cq.Location(cq.Vector(0, 0, 0)), color=ACCENT_COLOR, name="MountPlate")
        
        # Build battery
        battery = _build_battery(s["battery_type"])
        battery = battery.translate((0, 0, s["ground_clearance"] + s["wheel_diameter"] + s["base_height"]/2))
        bat_color = BATTERY_SPECS[s["battery_type"]]["color"]
        assy.add(battery, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(*bat_color), name="Battery")
        
        # Build sensors
        sensor_spec = s["sensor_spec"]
        if sensor_spec["lidar"]:
            lidar = _build_lidar()
            lidar = lidar.translate((0, 0, s["ground_clearance"] + s["wheel_diameter"] + s["base_height"] + 30))
            assy.add(lidar, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.1, 0.1, 0.1), name="LiDAR")
        
        cam_count = sensor_spec["camera_count"]
        if cam_count > 0:
            cam_positions = [(s["base_length"]/2 - 10, 0), (-s["base_length"]/2 + 10, 0)]
            for i in range(min(cam_count, 2)):
                cam = _build_camera()
                cam = cam.rotate((0, 0, 0), (0, 1, 0), 90 if i == 0 else -90)
                cx, cy = cam_positions[i]
                cam = cam.translate((cx, cy, s["ground_clearance"] + s["wheel_diameter"] + s["base_height"] + 15))
                assy.add(cam, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.15, 0.15, 0.15), name=f"Camera{i+1}")
        
        return assy
$PYAMR$,

  -- Core library
  $PYCORE_AMR$
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
$PYCORE_AMR$,

  -- Param specs as JSON
  '[{"name":"base_length","type":"float","unit":"mm","description":"Base platform length","default":800,"min_val":400,"max_val":1500},{"name":"base_width","type":"float","unit":"mm","description":"Base platform width","default":600,"min_val":300,"max_val":1000},{"name":"base_height","type":"float","unit":"mm","description":"Base platform height","default":300,"min_val":150,"max_val":500},{"name":"wheel_type","type":"enum","unit":null,"description":"Wheel type","default":"mecanum","enum_options":["mecanum","omni","differential","skid_steer"]},{"name":"wheel_diameter","type":"float","unit":"mm","description":"Wheel diameter","default":150,"min_val":80,"max_val":250},{"name":"wheel_count","type":"int","unit":null,"description":"Number of wheels","default":4,"min_val":3,"max_val":6},{"name":"ground_clearance","type":"float","unit":"mm","description":"Ground clearance","default":50,"min_val":20,"max_val":100},{"name":"max_speed_kmh","type":"float","unit":"km/h","description":"Maximum speed","default":6,"min_val":1,"max_val":20},{"name":"payload_capacity_kg","type":"float","unit":"kg","description":"Payload capacity","default":200,"min_val":50,"max_val":1000},{"name":"battery_type","type":"enum","unit":null,"description":"Battery chemistry","default":"lithium_ion","enum_options":["lithium_ion","lead_acid","lithium_iron_phosphate"]},{"name":"charging_method","type":"enum","unit":null,"description":"Charging method","default":"automatic_dock","enum_options":["automatic_dock","manual_swap","opportunity_charge"]},{"name":"sensor_configuration","type":"enum","unit":null,"description":"Sensor configuration","default":"full_slam","enum_options":["basic","navigation","full_slam"]}]'::jsonb,

  -- Defaults as JSON
  '{"base_length":800,"base_width":600,"base_height":300,"wheel_type":"mecanum","wheel_diameter":150,"wheel_count":4,"ground_clearance":50,"max_speed_kmh":6,"payload_capacity_kg":200,"battery_type":"lithium_ion","charging_method":"automatic_dock","sensor_configuration":"full_slam"}'::jsonb,

  'Wheel count compatible with wheel type. Payload compatible with wheel size.',
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


-- ─── ASRS (Automated Storage) Grammar ─────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'asrs',
  'Automated Storage and Retrieval System',
  'ASRS (Automated Storage and Retrieval System) for warehouses. Miniload, crane-based, shuttle, or carousel configurations with rack structure and throughput analysis.',
  ARRAY['asrs', 'automated storage', 'warehouse automation', 'storage system', 'miniload', 'crane based', 'shuttle', 'carousel', 'storage rack', 'as/rs', 'automated warehouse', 'pick module', 'storage retrieval', 'warehouse robot', 'rack system'],
  ARRAY[
    'Design a miniload ASRS with 1000 storage locations',
    'Create a 5-bay deep ASRS system',
    'Build an 8-level high storage system',
    'Design an ASRS with 100 picks per hour throughput',
    'Create a crane-based ASRS with sprinkler protection'
  ],
  $PYASRS$
"""
ForgeOS ASRS Grammar — Automated Storage and Retrieval Systems
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# System type specifications
SYSTEM_SPECS = {
    "miniload": {"crane_type": "single", "bay_width": 1500, "typical_depth": 5},
    "crane_based": {"crane_type": "overhead", "bay_width": 3000, "typical_depth": 10},
    "shuttle": {"crane_type": "shuttle", "bay_width": 1200, "typical_depth": 20},
    "carousel": {"crane_type": "rotating", "bay_width": 2000, "typical_depth": 3},
}

# Pallet sizes
PALLET_SIZES = {
    "euro": {"width": 800, "length": 1200, "height": 144},
    "us": {"width": 1016, "length": 1219, "height": 144},
    "asia": {"width": 1100, "length": 1100, "height": 150},
}

RACK_COLOR = cq.Color(0.5, 0.5, 0.55)
BEAM_COLOR = cq.Color(0.6, 0.4, 0.2)
CRANE_COLOR = cq.Color(0.9, 0.6, 0.0)
SHUTTLE_COLOR = cq.Color(0.2, 0.5, 0.8)

def _build_rack_frame(width, height, depth, levels):
    """Build rack upright frame."""
    upright = cq.Workplane("XY").box(100, depth, height)
    return upright

def _build_rack_beam(width, depth):
    """Build horizontal beam."""
    beam = cq.Workplane("XY").box(width, 80, 100)
    return beam

def _build_rack_level(width, depth, level_height):
    """Build complete rack level with beams."""
    # Left upright
    left = _build_rack_frame(width, level_height, depth)
    left = left.translate((-width/2 + 50, 0, level_height/2))
    
    # Right upright
    right = _build_rack_frame(width, level_height, depth)
    right = right.translate((width/2 - 50, 0, level_height/2))
    
    # Front beam
    front_beam = _build_rack_beam(width, depth)
    front_beam = front_beam.translate((0, -depth/2 + 40, level_height - 50))
    
    # Back beam
    back_beam = _build_rack_beam(width, depth)
    back_beam = back_beam.translate((0, depth/2 - 40, level_height - 50))
    
    return left.union(right).union(front_beam).union(back_beam)

def _build_pallet_positions(width, depth, pallet_width, pallet_length, positions_deep):
    """Build pallet position markers."""
    positions_x = int(width / (pallet_width + 100))
    positions_z = positions_deep
    
    markers = []
    for x in range(positions_x):
        for z in range(positions_z):
            px = -width/2 + (x + 0.5) * (width / positions_x)
            pz = -depth/2 + (z + 0.5) * (depth / positions_z)
            
            marker = cq.Workplane("XY").box(pallet_width - 20, pallet_length - 20, 5)
            marker = marker.translate((px, pz, 5))
            markers.append(marker)
    
    result = markers[0]
    for m in markers[1:]:
        result = result.union(m)
    return result

def _build_crane(length, height):
    """Build crane/gantry for ASRS."""
    # Gantry beam
    gantry = cq.Workplane("XY").box(length, 100, 150)
    gantry = gantry.translate((0, 0, height - 75))
    
    # Support legs
    leg1 = cq.Workplane("XY").box(80, 80, height)
    leg1 = leg1.translate((-length/2 + 40, 0, height/2))
    leg2 = cq.Workplane("XY").box(80, 80, height)
    leg2 = leg2.translate((length/2 - 40, 0, height/2))
    
    return gantry.union(leg1).union(leg2)

def _build_shuttle(width, depth):
    """Build shuttle vehicle."""
    shuttle = cq.Workplane("XY").box(depth - 100, width - 100, 80)
    return shuttle

def _check_throughput_depth(s):
    """Throughput should be compatible with storage depth."""
    depth = s["storage_depth"]
    throughput = s["throughput_per_hour"]
    
    if depth > 10 and throughput > 150:
        return False, f"High throughput {throughput}/hr may not be achievable with {depth} deep storage"
    return True, ""

def _check_height_levels(s):
    """Storage height should be reasonable for system type."""
    levels = s["storage_height_levels"]
    system = s["system_type"]
    
    if system == "carousel" and levels > 10:
        return False, f"Carousel with {levels} levels may be impractical"
    if system == "miniload" and levels > 15:
        return False, f"Miniload with {levels} levels exceeds typical limits"
    return True, ""

class ASRSGrammar(DomainGrammar):
    @property
    def name(self): return "asrs"
    @property
    def display_name(self): return "Automated Storage and Retrieval System"
    @property
    def description(self): return "ASRS for warehouse automation"

    def param_specs(self):
        return [
            ParamSpec("system_type", "enum", None, "ASRS system type", "miniload", enum_options=["miniload", "crane_based", "shuttle", "carousel"]),
            ParamSpec("storage_depth", "int", None, "Pallet positions deep", 5, 2, 20),
            ParamSpec("storage_height_levels", "int", None, "Number of height levels", 8, 2, 20),
            ParamSpec("pallet_width", "float", "mm", "Pallet width", 1200, 600, 1500),
            ParamSpec("pallet_length", "float", "mm", "Pallet length", 800, 600, 1500),
            ParamSpec("pallet_height", "float", "mm", "Pallet height", 150, 100, 200),
            ParamSpec("aisle_width", "float", "m", "Aisle width for crane", 2.0, 1.5, 4.0),
            ParamSpec("crane_rail_length", "float", "m", "Total crane rail length", 50, 10, 200),
            ParamSpec("storage_location_count", "int", None, "Total storage locations", 1000, 100, 10000),
            ParamSpec("throughput_per_hour", "int", None, "Target throughput (picks/hr)", 100, 20, 500),
            ParamSpec("rack_material", "enum", None, "Rack material", "steel", enum_options=["steel", "aluminum"]),
            ParamSpec("fire_protection", "enum", None, "Fire protection system", "sprinkler", enum_options=["none", "sprinkler", "inert_gas"]),
            ParamSpec("control_system", "enum", None, "Control system", "plc", enum_options=["plc", "scada", "warehouse_management"]),
        ]

    def defaults(self):
        return {
            "system_type": "miniload", "storage_depth": 5, "storage_height_levels": 8,
            "pallet_width": 1200, "pallet_length": 800, "pallet_height": 150,
            "aisle_width": 2.0, "crane_rail_length": 50, "storage_location_count": 1000,
            "throughput_per_hour": 100, "rack_material": "steel", "fire_protection": "sprinkler",
            "control_system": "plc",
        }

    def constraints(self):
        return [
            Constraint("throughput_depth", "Throughput compatible with storage depth",
                lambda s: _check_throughput_depth(s), severity="warning"),
            Constraint("height_levels", "Height levels reasonable for system type",
                lambda s: _check_height_levels(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Get system specs
        s["system_spec"] = SYSTEM_SPECS.get(s["system_type"], SYSTEM_SPECS["miniload"])
        
        # Calculate dimensions
        pallet_pitch = s["pallet_length"] + 150  # pallet + aisle
        s["rack_width"] = s["storage_depth"] * pallet_pitch
        s["level_height"] = s["pallet_height"] + 300  # pallet + clearance
        s["rack_height"] = s["storage_height_levels"] * s["level_height"] + 500
        
        # Number of bays
        locations_per_level = s["storage_depth"] * 2  # 2 pallets wide per bay
        s["bay_count"] = max(int(s["storage_location_count"] / (locations_per_level * s["storage_height_levels"])), 1)
        
        s["rack_length"] = s["bay_count"] * 2500  # 2.5m per bay
        
        return s

    def build(self, skeleton):
        s = skeleton
        
        assy = cq.Assembly(name="ForgeOS_ASRS")
        
        # Build rack structure for each level
        for level in range(s["storage_height_levels"]):
            z = (level + 0.5) * s["level_height"]
            
            level_beams = _build_rack_level(s["rack_width"], s["rack_length"], s["level_height"])
            level_beams = level_beams.translate((0, 0, z))
            assy.add(level_beams, loc=cq.Location(cq.Vector(0, 0, 0)), color=RACK_COLOR, name=f"Level{level+1}")
        
        # Add pallet position markers
        pallet_markers = _build_pallet_positions(s["rack_width"], s["rack_length"], s["pallet_width"], s["pallet_length"], s["storage_depth"])
        for level in range(s["storage_height_levels"]):
            z = (level + 1) * s["level_height"]
            markers_copy = pallet_markers.translate((0, 0, z))
            assy.add(markers_copy, loc=cq.Location(cq.Vector(0, 0, 0)), color=BEAM_COLOR, name=f"PalletPositions{level+1}")
        
        # Build crane for applicable systems
        if s["system_type"] in ("miniload", "crane_based"):
            crane = _build_crane(s["crane_rail_length"] * 1000, s["rack_height"] + 500)
            crane = crane.translate((0, s["aisle_width"] * 500, 0))
            assy.add(crane, loc=cq.Location(cq.Vector(0, 0, 0)), color=CRANE_COLOR, name="Crane")
        
        # Add shuttle for shuttle systems
        if s["system_type"] == "shuttle":
            shuttle = _build_shuttle(s["rack_width"], s["rack_length"])
            shuttle = shuttle.translate((0, 0, s["level_height"]))
            assy.add(shuttle, loc=cq.Location(cq.Vector(0, 0, 0)), color=SHUTTLE_COLOR, name="Shuttle")
        
        # Add fire protection (simplified sprinkler pipes)
        if s["fire_protection"] == "sprinkler":
            pipe = cq.Workplane("XY").box(s["rack_length"], 50, 50)
            pipe = pipe.translate((0, -s["rack_width"]/2 - 100, s["rack_height"] + 200))
            assy.add(pipe, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.8, 0.2, 0.2), name="SprinklerPipe")
        
        return assy
$PYASRS$,

  -- Core library
  $PYCORE_ASRS$
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
$PYCORE_ASRS$,

  -- Param specs as JSON
  '[{"name":"system_type","type":"enum","unit":null,"description":"ASRS system type","default":"miniload","enum_options":["miniload","crane_based","shuttle","carousel"]},{"name":"storage_depth","type":"int","unit":null,"description":"Pallet positions deep","default":5,"min_val":2,"max_val":20},{"name":"storage_height_levels","type":"int","unit":null,"description":"Number of height levels","default":8,"min_val":2,"max_val":20},{"name":"pallet_width","type":"float","unit":"mm","description":"Pallet width","default":1200,"min_val":600,"max_val":1500},{"name":"pallet_length","type":"float","unit":"mm","description":"Pallet length","default":800,"min_val":600,"max_val":1500},{"name":"pallet_height","type":"float","unit":"mm","description":"Pallet height","default":150,"min_val":100,"max_val":200},{"name":"aisle_width","type":"float","unit":"m","description":"Aisle width for crane","default":2.0,"min_val":1.5,"max_val":4.0},{"name":"crane_rail_length","type":"float","unit":"m","description":"Total crane rail length","default":50,"min_val":10,"max_val":200},{"name":"storage_location_count","type":"int","unit":null,"description":"Total storage locations","default":1000,"min_val":100,"max_val":10000},{"name":"throughput_per_hour","type":"int","unit":null,"description":"Target throughput (picks/hr)","default":100,"min_val":20,"max_val":500},{"name":"rack_material","type":"enum","unit":null,"description":"Rack material","default":"steel","enum_options":["steel","aluminum"]},{"name":"fire_protection","type":"enum","unit":null,"description":"Fire protection system","default":"sprinkler","enum_options":["none","sprinkler","inert_gas"]},{"name":"control_system","type":"enum","unit":null,"description":"Control system","default":"plc","enum_options":["plc","scada","warehouse_management"]}]'::jsonb,

  -- Defaults as JSON
  '{"system_type":"miniload","storage_depth":5,"storage_height_levels":8,"pallet_width":1200,"pallet_length":800,"pallet_height":150,"aisle_width":2.0,"crane_rail_length":50,"storage_location_count":1000,"throughput_per_hour":100,"rack_material":"steel","fire_protection":"sprinkler","control_system":"plc"}'::jsonb,

  'Throughput compatible with storage depth. Height levels reasonable for system type.',
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
