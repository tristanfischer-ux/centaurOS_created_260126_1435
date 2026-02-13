-- ═══════════════════════════════════════════════════════════════
-- Seed CAD Grammars: Rack Mount, Propeller, Structural Profile, Pressure Vessel, Jig Fixture
-- ═══════════════════════════════════════════════════════════════
-- Python source code is stored using dollar-quoting to avoid escaping.
-- The core_library_code is the base class framework (grammar.py).
-- The python_code is the domain-specific grammar.

-- ─── Rack Mount Enclosure Grammar ─────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'rack_mount',
  'Rack Mount Enclosure',
  '19-inch rack mount enclosures compliant with EIA-310 standards. Configurable rack units, depth, front/rear panels, and mounting patterns.',
  ARRAY['rack mount', '19 inch rack', 'rack enclosure', 'server rack', 'network rack', 'EIA-310', 'rack unit', 'U rack', 'equipment rack', 'cabinet', 'data center', 'rack mount hardware'],
  ARRAY[
    'Design a 4U rack mount enclosure',
    'Create a half-width rack enclosure with vented front',
    'Build a 6U server rack with side panels',
    'Make a 42U rack with threaded mounting holes',
    'Design a 600mm depth aluminum rack enclosure'
  ],
  $PYRACKMOUNT$
"""
ForgeOS Rack Mount Grammar — 19" Rack Enclosures (EIA-310)
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# EIA-310 rack dimensions
RACK_WIDTH_INCH = 19  # Standard rack width
RACK_U_HEIGHT_MM = 44.45  # 1U = 44.45mm
INCH_TO_MM = 25.4

# Common rack depths in mm
RACK_DEPTHS = [300, 400, 450, 500, 600, 700, 800, 1000]

# Width style multipliers
WIDTH_STYLES = {
    "full_width": 1.0,
    "half_width": 0.5,
}

# Material densities (g/cm3)
MATERIAL_DENSITIES = {
    "steel": 7.85,
    "aluminum": 2.70,
    "acrylic": 1.18,
}

def _eia_310_dimensions(rack_units, width_style, depth_mm):
    """Calculate EIA-310 compliant dimensions."""
    # Overall height includes top and bottom clearance
    height_mm = rack_units * RACK_U_HEIGHT_MM + 10  # +10mm for top/bottom
    
    # Width: 19" standard + rails
    rack_width_mm = RACK_WIDTH_INCH * INCH_TO_MM
    if width_style == "half_width":
        usable_width = rack_width_mm * 0.5
    else:
        usable_width = rack_width_mm - 44  # Subtract rail width
    
    # Depth includes front/rear mounting
    total_depth = depth_mm + 50  # Front rail to rear rail
    
    return height_mm, usable_width, total_depth, rack_width_mm

def _build_enclosure_frame(height, width, depth, material):
    """Build rack enclosure frame."""
    frame_thickness = 2  # Frame rail thickness
    
    # Vertical rails
    front_left = cq.Workplane("XY").box(frame_thickness, height, frame_thickness)
    front_right = cq.Workplane("XY").box(frame_thickness, height, frame_thickness).translate((width - frame_thickness, 0, 0))
    rear_left = cq.Workplane("XY").box(frame_thickness, height, frame_thickness).translate((0, 0, depth - frame_thickness))
    rear_right = cq.Workplane("XY").box(frame_thickness, height, frame_thickness).translate((width - frame_thickness, 0, depth - frame_thickness))
    
    frame = front_left.union(front_right).union(rear_left).union(rear_right)
    
    return frame

def _add_mounting_rails(height, width, depth, hole_pattern):
    """Add front and rear mounting rails with holes."""
    rail_height = height - 10
    rail_width = 10
    
    # Front rails
    front_rail_left = cq.Workplane("XY").box(rail_width, rail_height, 3)
    front_rail_right = cq.Workplane("XY").box(rail_width, rail_height, 3).translate((width - rail_width, 0, 0))
    
    # Rear rails
    rear_rail_left = cq.Workplane("XY").box(rail_width, rail_height, 3).translate((0, 0, depth - 3))
    rear_rail_right = cq.Workplane("XY").box(rail_width, rail_height, 3).translate((width - rail_width, 0, depth - 3))
    
    rails = front_rail_left.union(front_rail_right).union(rear_rail_left).union(rear_rail_right)
    
    # Cut mounting holes
    if hole_pattern == "square":
        # Square holes (cage nut style)
        hole_spacing_u = 0.5  # U spacing (half-U increments)
        hole_size = 9  # M6 clearance
    else:  # threaded
        hole_spacing_u = 1.0
        hole_size = 6  # M5 threaded
        
    holes_per_rail = int(rail_height / RACK_U_HEIGHT_MM * 2)  # 2 holes per U
    
    for rail_x in [0, width - rail_width]:
        for hole_idx in range(holes_per_rail):
            y = 5 + hole_idx * (RACK_U_HEIGHT_MM / 2)  # Start 5mm from bottom
            if y < rail_height - 5:
                # Front rail holes
                hole = cq.Workplane("XY").circle(hole_size / 2).extrude(5)
                rails = rails.cut(hole.translate((rail_x + rail_width/2, y, 1.5)))
                
                # Rear rail holes
                hole = cq.Workplane("XY").circle(hole_size / 2).extrude(5)
                rails = rails.cut(hole.translate((rail_x + rail_width/2, y, depth - 1.5)))
    
    return rails

def _add_front_panel(width, height, depth, style, has_panel):
    """Add front panel or vent."""
    if not has_panel:
        return None
    
    panel_thickness = 1.5
    
    if style == "solid":
        panel = cq.Workplane("XY").box(width - 4, height - 10, panel_thickness)
    elif style == "vented":
        # Create vented panel with slots
        panel = cq.Workplane("XY").box(width - 4, height - 10, panel_thickness)
        # Cut vent slots
        slot_width = 3
        slot_spacing = 8
        num_slots = int((height - 20) / slot_spacing)
        for i in range(num_slots):
            y = 10 + i * slot_spacing
            slot = cq.Workplane("XY").box(width - 20, slot_width, panel_thickness + 1)
            panel = panel.cut(slot.translate((10, y, 0)))
    else:  # mesh
        # Create mesh pattern panel
        panel = cq.Workplane("XY").box(width - 4, height - 10, panel_thickness)
        # Cut circular mesh holes
        mesh_hole = 4
        spacing = 8
        for x in range(int((width - 10) / spacing)):
            for y in range(int((height - 20) / spacing)):
                hole = cq.Workplane("XY").circle(mesh_hole / 2).extrude(panel_thickness + 1)
                panel = panel.cut(hole.translate((5 + x * spacing, 10 + y * spacing, 0)))
    
    return panel.translate((2, 5, 5))

def _add_side_panels(width, height, depth, material, has_side):
    """Add side panels."""
    if not has_side:
        return None
    
    panel_thickness = 1.0
    
    left_panel = cq.Workplane("XY").box(panel_thickness, height - 10, depth - 10)
    right_panel = cq.Workplane("XY").box(panel_thickness, height - 10, depth - 10).translate((width - panel_thickness, 0, 0))
    
    return left_panel.union(right_panel)

def _add_rear_panel(width, height, depth, material, has_rear):
    """Add rear panel."""
    if not has_rear:
        return None
    
    panel_thickness = 1.0
    panel = cq.Workplane("XY").box(width - 4, height - 10, panel_thickness)
    
    return panel.translate((2, 5, depth - panel_thickness - 5))

def _check_rack_unit_limits(s):
    """Rack units should be within standard range."""
    ru = s["rack_units"]
    if ru < 1 or ru > 48:
        return False, f"Rack units {ru} outside EIA-310 range (1-48U)"
    return True, ""

def _check_depth_range(s):
    """Depth should be standard rack depth."""
    depth = s["depth_mm"]
    if depth < 200 or depth > 1200:
        return False, f"Depth {depth}mm outside typical range (200-1200mm)"
    return True, ""

class RackMountGrammar(DomainGrammar):
    @property
    def name(self): return "rack_mount"
    @property
    def display_name(self): return "Rack Mount Enclosure"
    @property
    def description(self): return "19-inch rack mount enclosures compliant with EIA-310"

    def param_specs(self):
        return [
            ParamSpec("rack_units", "int", None, "Number of rack units (1-48U)", 4, 1, 48),
            ParamSpec("width_style", "enum", None, "Width style", "full_width", enum_options=["full_width", "half_width"]),
            ParamSpec("depth_mm", "float", "mm", "Mounting depth", 600, 200, 1200),
            ParamSpec("front_rail_style", "enum", None, "Front panel style", "vented", enum_options=["solid", "vented", "mesh"]),
            ParamSpec("side_panel", "bool", None, "Include side panels", True, None, None),
            ParamSpec("rear_panel", "bool", None, "Include rear panel", True, None, None),
            ParamSpec("mounting_hole_pattern", "enum", None, "Mounting hole pattern", "square", enum_options=["square", "threaded"]),
            ParamSpec("material", "enum", None, "Frame material", "steel", enum_options=["steel", "aluminum", "acrylic"]),
        ]

    def defaults(self):
        return {
            "rack_units": 4, "width_style": "full_width", "depth_mm": 600,
            "front_rail_style": "vented", "side_panel": True, "rear_panel": True,
            "mounting_hole_pattern": "square", "material": "steel",
        }

    def constraints(self):
        return [
            Constraint("rack_unit_limits", "Rack units 1-48U per EIA-310",
                lambda s: _check_rack_unit_limits(s), severity="error"),
            Constraint("depth_range", "Depth 200-1200mm",
                lambda s: _check_depth_range(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        s["width_multiplier"] = WIDTH_STYLES.get(s["width_style"], 1.0)
        s["material_density"] = MATERIAL_DENSITIES.get(s["material"], 7.85)
        
        height, usable_width, total_depth, rack_width = _eia_310_dimensions(
            s["rack_units"], s["width_style"], s["depth_mm"]
        )
        s["height_mm"] = height
        s["usable_width_mm"] = usable_width
        s["total_depth_mm"] = total_depth
        s["rack_width_mm"] = rack_width
        
        return s

    def build(self, skeleton):
        s = skeleton
        height = s["height_mm"]
        width = s["rack_width_mm"]
        depth = s["total_depth_mm"]
        
        assy = cq.Assembly(name="ForgeOS_RackMount")
        
        # Build frame
        frame = _build_enclosure_frame(height, width, depth, s["material"])
        frame_color = cq.Color(0.4, 0.4, 0.45) if s["material"] == "steel" else cq.Color(0.7, 0.7, 0.75)
        assy.add(frame, loc=cq.Location(cq.Vector(0, 0, 0)), color=frame_color, name="FrameRails")
        
        # Add mounting rails
        rails = _add_mounting_rails(height, width, depth, s["mounting_hole_pattern"])
        assy.add(rails, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.35, 0.35, 0.4), name="MountingRails")
        
        # Add front panel
        front = _add_front_panel(width, height, depth, s["front_rail_style"], True)
        if front:
            assy.add(front, loc=cq.Location(cq.Vector(0, 0, 0)), color=frame_color, name="FrontPanel")
        
        # Add side panels
        if s["side_panel"]:
            sides = _add_side_panels(width, height, depth, s["material"], True)
            assy.add(sides, loc=cq.Location(cq.Vector(0, 0, 0)), color=frame_color, name="SidePanels")
        
        # Add rear panel
        if s["rear_panel"]:
            rear = _add_rear_panel(width, height, depth, s["material"], True)
            assy.add(rear, loc=cq.Location(cq.Vector(0, 0, 0)), color=frame_color, name="RearPanel")
        
        return assy
$PYRACKMOUNT$,

  -- Core library
  $PYCORE_RACKMOUNT$
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
$PYCORE_RACKMOUNT$,

  -- Param specs as JSON
  '[{"name":"rack_units","type":"int","unit":null,"description":"Number of rack units (1-48U)","default":4,"min_val":1,"max_val":48},{"name":"width_style","type":"enum","unit":null,"description":"Width style","default":"full_width","enum_options":["full_width","half_width"]},{"name":"depth_mm","type":"float","unit":"mm","description":"Mounting depth","default":600,"min_val":200,"max_val":1200},{"name":"front_rail_style","type":"enum","unit":null,"description":"Front panel style","default":"vented","enum_options":["solid","vented","mesh"]},{"name":"side_panel","type":"bool","unit":null,"description":"Include side panels","default":true},{"name":"rear_panel","type":"bool","unit":null,"description":"Include rear panel","default":true},{"name":"mounting_hole_pattern","type":"enum","unit":null,"description":"Mounting hole pattern","default":"square","enum_options":["square","threaded"]},{"name":"material","type":"enum","unit":null,"description":"Frame material","default":"steel","enum_options":["steel","aluminum","acrylic"]}]'::jsonb,

  -- Defaults as JSON
  '{"rack_units":4,"width_style":"full_width","depth_mm":600,"front_rail_style":"vented","side_panel":true,"rear_panel":true,"mounting_hole_pattern":"square","material":"steel"}'::jsonb,

  'Rack units 1-48U per EIA-310. Depth 200-1200mm.',
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


-- ─── Propeller Grammar ────────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'propeller',
  'Propeller / Fan',
  'Propeller and fan blades with configurable pitch, hub style, and NACA-style airfoil profiles for aerodynamic applications.',
  ARRAY['propeller', 'fan', 'blade', 'airfoil', 'NACA', 'pitch', 'hub', 'prop', 'fan blade', 'cooling fan', 'axial fan', 'thrust', 'CFD', 'aerodynamic'],
  ARRAY[
    'Design a 200mm diameter propeller with 20 degree pitch',
    'Create a 3-blade fan with tapered hub',
    'Build a 6-blade propeller for drone',
    'Make a 150mm fan with cylindrical hub',
    'Design a high-pitch propeller for forward thrust'
  ],
  $PYPROPELLER$
"""
ForgeOS Propeller Grammar — Fans and Propellers with Pitch
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# NACA-style airfoil approximations (thickness as % of chord)
AIRFOIL_THICKNESS = 0.12  # 12% thickness

# Hub style parameters
HUB_STYLES = {
    "standard": {"taper_ratio": 0.7, "length_factor": 1.0},
    "taper": {"taper_ratio": 0.5, "length_factor": 1.2},
    "cylindrical": {"taper_ratio": 1.0, "length_factor": 0.8},
}

def _naca_airfoil(chord, thickness_pct=0.12):
    """Generate NACA-style airfoil profile points."""
    points = []
    num_points = 20
    
    for i in range(num_points + 1):
        x = i / num_points  # 0 to 1
        
        # NACA 4-digit thickness distribution
        yt = 5 * thickness_pct * (
            0.2969 * math.sqrt(x)
            - 0.1260 * x
            - 0.3516 * x**2
            + 0.2843 * x**3
            - 0.1015 * x**4
        )
        
        # Upper surface
        points.append((x * chord, yt * chord))
    
    # Lower surface (reverse)
    for i in range(num_points, -1, -1):
        x = i / num_points
        yt = 5 * thickness_pct * (
            0.2969 * math.sqrt(x)
            - 0.1260 * x
            - 0.3516 * x**2
            + 0.2843 * x**3
            - 0.1015 * x**4
        )
        points.append((x * chord, -yt * chord))
    
    return points

def _build_blade(chord, thickness, length, pitch_angle_deg, hub_radius):
    """Build a single propeller blade with airfoil profile."""
    # Calculate blade twist based on pitch
    pitch_rad = math.radians(pitch_angle_deg)
    
    # Create airfoil at root and tip
    root_profile = _naca_airfoil(chord, thickness)
    
    # Scale chord at tip (slightly smaller)
    tip_scale = 0.7
    tip_profile = _naca_airfoil(chord * tip_scale, thickness)
    
    # Build blade using loft between root and tip profiles
    # Start with root profile
    blade = cq.Workplane("XY").polyline(root_profile).close().extrude(length * 0.1)
    
    # Scale and extrude to tip
    for i in range(10):
        t = (i + 1) / 10
        scale = 1 - t * (1 - tip_scale)
        
        # Interpolate profile
        scaled_profile = [(x * scale, y * scale * (1 - t * 0.3)) for x, y in root_profile]
        
        # Extrude with twist (pitch)
        twist = pitch_rad * t
        section = cq.Workplane("XY").polyline(scaled_profile).close().extrude(length / 10)
        section = section.rotate((0, 0, 0), (0, 0, 1), math.degrees(twist))
        
        blade = blade.union(section.translate((0, 0, t * length)))
    
    return blade

def _build_hub(diameter, length, style, bore_diameter=0):
    """Build propeller hub."""
    params = HUB_STYLES.get(style, HUB_STYLES["standard"])
    taper_ratio = params["taper_ratio"]
    length_factor = params["length_factor"]
    
    actual_length = length * length_factor
    
    if style == "cylindrical":
        hub = cq.Workplane("XY").circle(diameter / 2).extrude(actual_length)
    else:
        # Tapered hub using cone
        base_radius = diameter / 2
        tip_radius = base_radius * taper_ratio
        hub = cq.Workplane("XY").circle(base_radius).extrude(1)
        
        # Create tapered section
        for i in range(10):
            t = (i + 1) / 10
            r = base_radius - (base_radius - tip_radius) * t
            section = cq.Workplane("XY").circle(r).extrude(actual_length / 10)
            hub = hub.union(section.translate((0, 0, t * actual_length)))
    
    # Cut bore if specified
    if bore_diameter > 0:
        bore = cq.Workplane("XY").circle(bore_diameter / 2).extrude(actual_length * 2)
        hub = hub.cut(bore)
    
    return hub

def _build_spinner(diameter, length):
    """Build spinner cone for nose cone."""
    cone = cq.Workplane("XY").circle(diameter / 2).extrude(length / 2)
    
    # Create cone shape
    for i in range(5):
        t = (i + 1) / 5
        r = diameter / 2 * (1 - t * 0.7)
        section = cq.Workplane("XY").circle(r).extrude(length / 10)
        cone = cone.union(section.translate((0, 0, length / 2 + t * length / 2)))
    
    return cone

def _check_blade_count(s):
    """Blade count should be reasonable for diameter."""
    blades = s["blade_count"]
    diameter = s["diameter"]
    
    if blades < 2:
        return False, f"Need at least 2 blades for propeller"
    if blades > 8:
        return False, f"Maximum 8 blades recommended"
    if blades * s["blade_chord"] > diameter * 0.8:
        return False, f"Blade chord too large for diameter (overlap)"
    return True, ""

def _check_pitch_range(s):
    """Pitch angle should be in reasonable range."""
    pitch = s["pitch_angle_deg"]
    if pitch < 5:
        return False, f"Pitch {pitch}° too low (insufficient thrust)"
    if pitch > 60:
        return False, f"Pitch {pitch}° too high (blade stall risk)"
    return True, ""

class PropellerGrammar(DomainGrammar):
    @property
    def name(self): return "propeller"
    @property
    def display_name(self): return "Propeller / Fan"
    @property
    def description(self): return "Propeller and fan blades with configurable pitch"

    def param_specs(self):
        return [
            ParamSpec("diameter", "float", "mm", "Propeller diameter", 200, 50, 1000),
            ParamSpec("hub_diameter", "float", "mm", "Hub diameter", 30, 10, 200),
            ParamSpec("hub_length", "float", "mm", "Hub length", 40, 10, 200),
            ParamSpec("blade_count", "int", None, "Number of blades", 3, 2, 8),
            ParamSpec("blade_chord", "float", "mm", "Blade chord width", 20, 5, 100),
            ParamSpec("blade_thickness", "float", "mm", "Airfoil thickness ratio", 0.12, 0.05, 0.25),
            ParamSpec("pitch_angle_deg", "float", "degrees", "Blade pitch angle", 20, 5, 60),
            ParamSpec("hub_style", "enum", None, "Hub style", "standard", enum_options=["standard", "taper", "cylindrical"]),
        ]

    def defaults(self):
        return {
            "diameter": 200, "hub_diameter": 30, "hub_length": 40,
            "blade_count": 3, "blade_chord": 20, "blade_thickness": 0.12,
            "pitch_angle_deg": 20, "hub_style": "standard",
        }

    def constraints(self):
        return [
            Constraint("blade_count_valid", "Blade count 2-8 with reasonable chord",
                lambda s: _check_blade_count(s), severity="error"),
            Constraint("pitch_range", "Pitch angle 5-60 degrees",
                lambda s: _check_pitch_range(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Calculate blade length from diameter and hub
        s["blade_length"] = (s["diameter"] - s["hub_diameter"]) / 2
        
        # Hub parameters
        s["hub_params"] = HUB_STYLES.get(s["hub_style"], HUB_STYLES["standard"])
        
        return s

    def build(self, skeleton):
        s = skeleton
        diameter = s["diameter"]
        hub_diameter = s["hub_diameter"]
        hub_length = s["hub_length"]
        blade_count = s["blade_count"]
        blade_chord = s["blade_chord"]
        blade_thickness = s["blade_thickness"]
        pitch_angle = s["pitch_angle_deg"]
        
        assy = cq.Assembly(name="ForgeOS_Propeller")
        
        # Build hub
        hub = _build_hub(hub_diameter, hub_length, s["hub_style"])
        assy.add(hub, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.3, 0.3, 0.35), name="Hub")
        
        # Build blades
        blade_length = s["blade_length"]
        for i in range(blade_count):
            angle = (2 * math.pi * i) / blade_count
            
            blade = _build_blade(blade_chord, blade_thickness, blade_length, pitch_angle, hub_diameter / 2)
            
            # Position blade around hub
            blade = blade.rotate((0, 0, 0), (0, 0, 1), math.degrees(angle))
            blade = blade.translate((diameter / 4, 0, hub_length / 2))
            
            assy.add(blade, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.6, 0.6, 0.65), name=f"Blade{i+1}")
        
        # Add spinner cone
        spinner = _build_spinner(hub_diameter * 0.6, hub_length * 0.5)
        assy.add(spinner, loc=cq.Location(cq.Vector(0, 0, -hub_length * 0.25)), color=cq.Color(0.35, 0.35, 0.4), name="Spinner")
        
        return assy
$PYPROPELLER$,

  -- Core library
  $PYCORE_PROPELLER$
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
$PYCORE_PROPELLER$,

  -- Param specs as JSON
  '[{"name":"diameter","type":"float","unit":"mm","description":"Propeller diameter","default":200,"min_val":50,"max_val":1000},{"name":"hub_diameter","type":"float","unit":"mm","description":"Hub diameter","default":30,"min_val":10,"max_val":200},{"name":"hub_length","type":"float","unit":"mm","description":"Hub length","default":40,"min_val":10,"max_val":200},{"name":"blade_count","type":"int","unit":null,"description":"Number of blades","default":3,"min_val":2,"max_val":8},{"name":"blade_chord","type":"float","unit":"mm","description":"Blade chord width","default":20,"min_val":5,"max_val":100},{"name":"blade_thickness","type":"float","unit":"mm","description":"Airfoil thickness ratio","default":0.12,"min_val":0.05,"max_val":0.25},{"name":"pitch_angle_deg","type":"float","unit":"degrees","description":"Blade pitch angle","default":20,"min_val":5,"max_val":60},{"name":"hub_style","type":"enum","unit":null,"description":"Hub style","default":"standard","enum_options":["standard","taper","cylindrical"]}]'::jsonb,

  -- Defaults as JSON
  '{"diameter":200,"hub_diameter":30,"hub_length":40,"blade_count":3,"blade_chord":20,"blade_thickness":0.12,"pitch_angle_deg":20,"hub_style":"standard"}'::jsonb,

  'Blade count 2-8. Pitch angle 5-60 degrees. Blade chord fits within diameter.',
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


-- ─── Structural Profile Grammar ────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'structural_profile',
  'Structural Steel Profile',
  'Standard structural steel shapes from AISC manual including I-beams, H-beams, C-channels, angles, and tubes with derived dimensions.',
  ARRAY['structural steel', 'I beam', 'H beam', 'W beam', 'HE beam', 'C channel', 'angle', 'steel shape', 'tube', 'rectangular tube', 'round tube', 'AISC', 'steel profile', 'structural member'],
  ARRAY[
    'Design a W200x46 I-beam',
    'Create a 3000mm HE200A beam',
    'Build a C-channel C200x20',
    'Make a square tube 100x100x5',
    'Design a 200x200 angle bracket'
  ],
  $PYPROFILE$
"""
ForgeOS Structural Profile Grammar — AISC Steel Shapes
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# AISC steel manual dimensions (simplified lookup)
# Format: {designation: {d: depth, bf: flange_width, tw: web_thickness, tf: flange_thickness, r: fillet_radius}}
STEEL_SHAPES = {
    # W shapes (Wide-flange)
    "W200x46": {"d": 206, "bf": 102, "tw": 6.2, "tf": 8.0, "r": 10},
    "W200x53": {"d": 210, "bf": 134, "tw": 6.4, "tf": 10.2, "r": 10},
    "W250x73": {"d": 253, "bf": 146, "tw": 6.1, "tf": 9.3, "r": 13},
    "W310x97": {"d": 313, "bf": 166, "tw": 6.6, "tf": 11.2, "r": 15},
    "W360x147": {"d": 370, "bf": 256, "tw": 9.4, "tf": 16.4, "r": 20},
    # HP shapes (HP-pile)
    "HP200x53": {"d": 204, "bf": 207, "tw": 8.0, "tf": 8.0, "r": 10},
    "HP250x85": {"d": 246, "bf": 256, "tw": 10.5, "tf": 10.7, "r": 13},
    # M shapes (Miscellaneous)
    "M200x90": {"d": 210, "bf": 100, "tw": 10.0, "tf": 16.5, "r": 8},
    # S shapes (American standard)
    "S200x27": {"d": 203, "bf": 69, "tw": 6.1, "tf": 10.8, "r": 10},
    "S310x74": {"d": 305, "bf": 101, "tw": 7.5, "tf": 13.7, "r": 15},
}

# H-beams (European/Asian)
HE_SHAPES = {
    "HE100A": {"d": 96, "bf": 100, "tw": 5.0, "tf": 8.0, "r": 12},
    "HE120A": {"d": 114, "bf": 120, "tw": 5.0, "tf": 8.0, "r": 12},
    "HE140A": {"d": 133, "bf": 140, "tw": 5.5, "tf": 8.5, "r": 15},
    "HE160A": {"d": 152, "bf": 160, "tw": 6.0, "tf": 9.0, "r": 15},
    "HE180A": {"d": 171, "bf": 180, "tw": 6.0, "tf": 9.5, "r": 18},
    "HE200A": {"d": 190, "bf": 200, "tw": 6.5, "tf": 10.0, "r": 18},
    "HE220A": {"d": 210, "bf": 220, "tw": 7.0, "tf": 11.0, "r": 21},
    "HE240A": {"d": 230, "bf": 240, "tw": 7.5, "tf": 12.0, "r": 21},
    "HE260A": {"d": 250, "bf": 260, "tw": 7.5, "tf": 12.5, "r": 24},
    "HE280A": {"d": 270, "bf": 280, "tw": 8.0, "tf": 13.0, "r": 24},
    "HE300A": {"d": 290, "bf": 300, "tw": 8.5, "tf": 14.0, "r": 27},
    "HE320A": {"d": 310, "bf": 300, "tw": 9.0, "tf": 15.5, "r": 27},
    "HE340A": {"d": 330, "bf": 300, "tw": 9.5, "tf": 16.5, "r": 27},
    "HE360A": {"d": 350, "bf": 300, "tw": 10.0, "tf": 17.5, "r": 27},
    "HE400A": {"d": 390, "bf": 300, "tw": 11.0, "tf": 19.0, "r": 27},
    "HE450A": {"d": 440, "bf": 300, "tw": 11.5, "tf": 21.0, "r": 27},
    "HE500A": {"d": 490, "bf": 300, "tw": 12.0, "tf": 23.0, "r": 27},
}

# C-channel (American standard C)
C_CHANNELS = {
    "C75x9": {"d": 76, "bf": 35, "tw": 4.0, "tf": 6.8, "r": 4},
    "C100x13": {"d": 102, "bf": 41, "tw": 4.7, "tf": 7.5, "r": 5},
    "C150x19": {"d": 152, "bf": 48, "tw": 5.1, "tf": 8.1, "r": 6},
    "C200x27": {"d": 203, "bf": 57, "tw": 5.6, "tf": 9.0, "r": 8},
    "C250x37": {"d": 254, "bf": 66, "tw": 6.1, "tf": 10.0, "r": 10},
    "C300x45": {"d": 305, "bf": 74, "tw": 6.6, "tf": 12.0, "r": 10},
}

# L-angles (equal leg)
L_ANGLES = {
    "L25x25x3": {"d": 25, "bf": 25, "tw": 3, "r": 3.5},
    "L30x30x3": {"d": 30, "bf": 30, "tw": 3, "r": 4},
    "L40x40x4": {"d": 40, "bf": 40, "tw": 4, "r": 5},
    "L50x50x5": {"d": 50, "bf": 50, "tw": 5, "r": 6},
    "L60x60x6": {"d": 60, "bf": 60, "tw": 6, "r": 7},
    "L75x75x8": {"d": 75, "bf": 75, "tw": 8, "r": 9},
    "L100x100x10": {"d": 100, "bf": 100, "tw": 10, "r": 12},
}

# Square tubes
TUBE_SQUARE = {
    "50x50x3": {"d": 50, "bf": 50, "tw": 3, "r": 3},
    "75x75x5": {"d": 75, "bf": 75, "tw": 5, "r": 5},
    "100x100x5": {"d": 100, "bf": 100, "tw": 5, "r": 5},
    "100x100x8": {"d": 100, "bf": 100, "tw": 8, "r": 8},
    "150x150x6": {"d": 150, "bf": 150, "tw": 6, "r": 6},
    "150x150x10": {"d": 150, "bf": 150, "tw": 10, "r": 10},
    "200x200x8": {"d": 200, "bf": 200, "tw": 8, "r": 8},
    "200x200x12": {"d": 200, "bf": 200, "tw": 12, "r": 12},
}

# Round tubes
TUBE_ROUND = {
    "OD50x3": {"d": 50, "tw": 3, "r": 0},
    "OD75x5": {"d": 75, "tw": 5, "r": 0},
    "OD100x5": {"d": 100, "tw": 5, "r": 0},
    "OD100x10": {"d": 100, "tw": 10, "r": 0},
    "OD150x8": {"d": 150, "tw": 8, "r": 0},
    "OD200x10": {"d": 200, "tw": 10, "r": 0},
}

# Rectangular bars
RECT_BAR = {
    "100x10": {"d": 100, "bf": 10},
    "150x12": {"d": 150, "bf": 12},
    "200x20": {"d": 200, "bf": 20},
    "250x25": {"d": 250, "bf": 25},
}

# Material colors
MATERIAL_COLORS = {
    "steel": cq.Color(0.45, 0.45, 0.5),
}

def _get_profile_dimensions(profile_type, designation):
    """Get profile dimensions from designation."""
    if profile_type == "i_beam" or profile_type == "h_beam":
        # Check W shapes first, then HE shapes
        if designation.startswith("W") or designation.startswith("HP") or designation.startswith("M") or designation.startswith("S"):
            return STEEL_SHAPES.get(designation)
        elif designation.startswith("HE"):
            return HE_SHAPES.get(designation)
    elif profile_type == "c_channel":
        return C_CHANNELS.get(designation)
    elif profile_type == "angle":
        return L_ANGLES.get(designation)
    elif profile_type == "tube_square":
        return TUBE_SQUARE.get(designation)
    elif profile_type == "tube_round":
        return TUBE_ROUND.get(designation)
    elif profile_type == "rectangular_bar":
        return RECT_BAR.get(designation)
    return None

def _build_i_beam(d, bf, tw, tf, r, length):
    """Build I-beam shape."""
    # Web
    web = cq.Workplane("XY").box(tw, length, d - 2 * tf)
    
    # Flanges
    flange_left = cq.Workplane("XY").box(bf, length, tf)
    flange_left = flange_left.translate((-(bf - tw) / 2, 0, (d - tf) / 2))
    
    flange_right = cq.Workplane("XY").box(bf, length, tf)
    flange_right = flange_right.translate(((bf - tw) / 2, 0, (d - tf) / 2))
    
    beam = web.union(flange_left).union(flange_right)
    
    return beam

def _build_c_channel(d, bf, tw, tf, r, length):
    """Build C-channel shape."""
    # Web
    web = cq.Workplane("XY").box(tw, length, d)
    
    # Flange
    flange = cq.Workplane("XY").box(bf - tw / 2, length, tf)
    flange = flange.translate(((bf - tw / 2) / 2, 0, d - tf / 2))
    
    channel = web.union(flange)
    
    return channel

def _build_angle(d, bf, tw, r, length):
    """Build L-angle shape."""
    leg1 = cq.Workplane("XY").box(tw, length, d)
    leg2 = cq.Workplane("XY").box(bf, length, tw)
    leg2 = leg2.translate(((bf - tw) / 2, 0, tw / 2))
    
    angle = leg1.union(leg2)
    
    return angle

def _build_tube_square(d, bf, tw, r, length):
    """Build square tube."""
    outer = cq.Workplane("XY").box(bf, length, d)
    inner_w = bf - 2 * tw
    inner_h = d - 2 * tw
    
    if inner_w > 0 and inner_h > 0:
        inner = cq.Workplane("XY").box(inner_w, length + 1, inner_h)
        inner = inner.translate((tw, 0, tw))
        tube = outer.cut(inner)
    else:
        tube = outer
    
    return tube

def _build_tube_round(od, tw, length):
    """Build round tube."""
    outer = cq.Workplane("XY").circle(od / 2).extrude(length)
    inner_od = od - 2 * tw
    
    if inner_od > 0:
        inner = cq.Workplane("XY").circle(inner_od / 2).extrude(length + 1)
        tube = outer.cut(inner)
    else:
        tube = outer
    
    return tube

def _build_rect_bar(d, bf, length):
    """Build rectangular bar."""
    return cq.Workplane("XY").box(bf, length, d)

class StructuralProfileGrammar(DomainGrammar):
    @property
    def name(self): return "structural_profile"
    @property
    def display_name(self): return "Structural Steel Profile"
    @property
    def description(self): return "Standard structural steel shapes from AISC manual"

    def param_specs(self):
        return [
            ParamSpec("profile_type", "enum", None, "Profile type", "i_beam", enum_options=["i_beam", "h_beam", "c_channel", "angle", "tube_square", "tube_round", "rectangular_bar"]),
            ParamSpec("designation", "string", None, "Profile designation (e.g., W200x46)", "W200x46", None, None),
            ParamSpec("length", "float", "mm", "Profile length", 3000, 100, 12000),
        ]

    def defaults(self):
        return {
            "profile_type": "i_beam", "designation": "W200x46", "length": 3000,
        }

    def constraints(self):
        return []

    def derive_skeleton(self, params):
        s = dict(params)
        
        dims = _get_profile_dimensions(s["profile_type"], s["designation"])
        if dims:
            s.update(dims)
        else:
            # Default dimensions if not found
            s.update({"d": 200, "bf": 100, "tw": 6, "tf": 8, "r": 10})
        
        return s

    def build(self, skeleton):
        s = skeleton
        length = s["length"]
        profile_type = s["profile_type"]
        
        assy = cq.Assembly(name="ForgeOS_StructuralProfile")
        
        d = s.get("d", 200)
        bf = s.get("bf", 100)
        tw = s.get("tw", 6)
        tf = s.get("tf", 8)
        r = s.get("r", 10)
        
        if profile_type in ("i_beam", "h_beam"):
            part = _build_i_beam(d, bf, tw, tf, r, length)
            name = "IBeam" if profile_type == "i_beam" else "HBeam"
        elif profile_type == "c_channel":
            part = _build_c_channel(d, bf, tw, tf, r, length)
            name = "CChannel"
        elif profile_type == "angle":
            part = _build_angle(d, bf, tw, r, length)
            name = "Angle"
        elif profile_type == "tube_square":
            part = _build_tube_square(d, bf, tw, r, length)
            name = "SquareTube"
        elif profile_type == "tube_round":
            part = _build_tube_round(d, tw, length)
            name = "RoundTube"
        elif profile_type == "rectangular_bar":
            part = _build_rect_bar(d, bf, length)
            name = "RectBar"
        else:
            part = _build_i_beam(d, bf, tw, tf, r, length)
            name = "Profile"
        
        assy.add(part, loc=cq.Location(cq.Vector(0, 0, 0)), color=MATERIAL_COLORS["steel"], name=name)
        
        return assy
$PYPROFILE$,

  -- Core library
  $PYCORE_PROFILE$
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
$PYCORE_PROFILE$,

  -- Param specs as JSON
  '[{"name":"profile_type","type":"enum","unit":null,"description":"Profile type","default":"i_beam","enum_options":["i_beam","h_beam","c_channel","angle","tube_square","tube_round","rectangular_bar"]},{"name":"designation","type":"string","unit":null,"description":"Profile designation (e.g., W200x46)","default":"W200x46","min_val":null,"max_val":null},{"name":"length","type":"float","unit":"mm","description":"Profile length","default":3000,"min_val":100,"max_val":12000}]'::jsonb,

  -- Defaults as JSON
  '{"profile_type":"i_beam","designation":"W200x46","length":3000}'::jsonb,

  'Length 100-12000mm. Dimensions derived from AISC steel manual designations.',
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


-- ─── Pressure Vessel Grammar ───────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'pressure_vessel',
  'Pressure Vessel',
  'Pressure vessels with configurable heads per ASME VIII Division 1. Supports horizontal/vertical orientation, torispherical, ellipsoidal, conical, and hemispherical heads.',
  ARRAY['pressure vessel', 'ASME', 'tank', 'torispherical', 'ellipsoidal', 'conical', 'hemispherical', 'dished head', 'vessel', 'ASME VIII', 'pressure tank', 'saddle support', 'leg support', 'skirt support'],
  ARRAY[
    'Design a horizontal pressure vessel with torispherical heads',
    'Create a vertical vessel with ellipsoidal heads',
    'Build a 500mm diameter vessel with 10mm wall',
    'Make a pressure vessel with conical heads',
    'Design a horizontal tank with saddle supports'
  ],
  $PYVESSEL$
"""
ForgeOS Pressure Vessel Grammar — ASME VIII Vessels
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# ASME VIII head dimensions
# Torispherical (flanged & dished) head parameters
def _torispherical_head_params(diameter, wall_thickness, dish_factor=0.8, knuckle_factor=0.06):
    """Calculate torispherical head dimensions per ASME VIII."""
    r = diameter * dish_factor  # Dish radius
    k = diameter * knuckle_factor  # Knuckle radius
    
    # Minimum knuckle radius
    k_min = 0.05 * diameter
    k = max(k, k_min)
    
    # Crown radius
    crown_r = r
    
    # Knuckle radius
    knuckle_r = k
    
    # Depth of dished portion
    h_dish = r - math.sqrt(max(r**2 - (diameter / 2)**2, 0))
    
    # Total depth including straight flange
    h_total = h_dish + 3 * wall_thickness  # Minimum straight flange
    
    return {
        "crown_radius": crown_r,
        "knuckle_radius": knuckle_r,
        "dish_depth": h_dish,
        "total_depth": h_total,
    }

# Ellipsoidal head parameters
def _ellipsoidal_head_params(diameter, wall_thickness):
    """Calculate ellipsoidal head dimensions (2:1 ellipsoid)."""
    a = diameter / 2  # Semi-major axis
    b = diameter / 4  # Semi-minor axis (2:1 ratio)
    
    # Depth
    h = b
    
    # Total depth including straight flange
    h_total = h + 3 * wall_thickness
    
    return {
        "semi_major": a,
        "semi_minor": b,
        "depth": h,
        "total_depth": h_total,
    }

# Conical head parameters
def _conical_head_params(diameter, wall_thickness, half_angle_deg=30):
    """Calculate conical head dimensions."""
    half_angle = math.radians(half_angle_deg)
    
    # Cone depth
    h = (diameter / 2) / math.tan(half_angle)
    
    # Knuckle at transition
    r_knuckle = wall_thickness  # Minimum knuckle radius
    
    # Total depth
    h_total = h + r_knuckle
    
    return {
        "half_angle": half_angle_deg,
        "cone_depth": h,
        "knuckle_radius": r_knuckle,
        "total_depth": h_total,
    }

# Hemispherical head parameters
def _hemispherical_head_params(diameter, wall_thickness):
    """Calculate hemispherical head dimensions."""
    r = diameter / 2
    
    # Depth equals radius
    h = r
    
    # Total depth including straight flange
    h_total = h + 3 * wall_thickness
    
    return {
        "radius": r,
        "depth": h,
        "total_depth": h_total,
    }

def _build_torispherical_head(diameter, thickness, params):
    """Build torispherical (flanged & dished) head."""
    r = params["crown_radius"]
    k = params["knuckle_radius"]
    d = params["dish_depth"]
    
    # Create using revolve
    profile = []
    num_points = 20
    
    # Knuckle region
    for i in range(num_points):
        angle = math.pi / 2 * i / num_points
        x = k * math.cos(angle)
        y = k * (1 - math.sin(angle)) + d
        profile.append((x, y))
    
    # Dish region
    for i in range(num_points + 1):
        angle = math.pi / 2 * (i + num_points) / (2 * num_points)
        x = r * math.sin(angle)
        y = d - r * math.cos(angle)
        profile.append((x, y))
    
    # Close profile
    profile.append((0, 0))
    
    # Create head
    head = cq.Workplane("XY").polyline(profile).close().revolve()
    
    return head

def _build_ellipsoidal_head(diameter, thickness, params):
    """Build ellipsoidal head (2:1)."""
    a = params["semi_major"]
    b = params["semi_minor"]
    
    # Create ellipsoid using revolve
    profile = []
    num_points = 30
    
    for i in range(num_points + 1):
        x = a * i / num_points
        y = b * math.sqrt(1 - (x / a) ** 2)
        profile.append((x, y))
    
    # Create head
    head = cq.Workplane("XY").polyline(profile).revolve()
    
    return head

def _build_conical_head(diameter, thickness, params):
    """Build conical head."""
    half_angle = math.radians(params["half_angle"])
    h = params["cone_depth"]
    
    # Create cone
    base_r = diameter / 2
    tip_r = 0  # Point at tip (actually small knuckle)
    
    # Simple cone
    cone = cq.Workplane("XY").moveTo(0, 0).lineTo(base_r, 0).lineTo(0, h).close().revolve()
    
    return cone

def _build_hemispherical_head(diameter, thickness, params):
    """Build hemispherical head."""
    r = params["radius"]
    
    # Create hemisphere using revolve
    profile = []
    num_points = 20
    
    for i in range(num_points + 1):
        angle = math.pi * i / num_points
        x = r * math.sin(angle)
        y = r * math.cos(angle)
        profile.append((x, y))
    
    head = cq.Workplane("XY").polyline(profile).revolve()
    
    return head

def _build_vessel_shell(diameter, wall_thickness, length):
    """Build cylindrical vessel shell."""
    shell = cq.Workplane("XY").circle(diameter / 2).extrude(length)
    
    # Cut interior
    inner_id = diameter - 2 * wall_thickness
    if inner_id > 0:
        inner = cq.Workplane("XY").circle(inner_id / 2).extrude(length + 1)
        shell = shell.cut(inner)
    
    return shell

def _build_saddle_support(diameter, length, width_factor=0.3):
    """Build saddle support for horizontal vessel."""
    saddle_width = length * width_factor
    saddle_height = diameter * 0.3
    saddle_thickness = 10
    
    # Saddle arc
    angle = math.radians(120)  # 120 degree saddle
    saddle = cq.Workplane("XY").sphere(saddle_height)
    
    # Rectangular base
    base = cq.Workplane("XY").box(saddle_width, 20, saddle_thickness)
    
    return base

def _build_leg_support(diameter, height):
    """Build leg supports for vertical vessel."""
    leg_thickness = 10
    leg_width = 50
    
    leg = cq.Workplane("XY").box(leg_width, height, leg_thickness)
    
    return leg

def _build_skirt_support(diameter, height):
    """Build skirt support for vertical vessel."""
    skirt_thickness = 8
    
    skirt = cq.Workplane("XY").circle(diameter / 2 + 20).circle(diameter / 2).extrude(height)
    
    return skirt

def _check_wall_thickness(s):
    """Wall thickness should be adequate for pressure."""
    d = s["diameter"]
    t = s["wall_thickness"]
    
    # Simple rule: t >= D/50 for carbon steel
    min_t = d / 50
    if t < min_t:
        return False, f"Wall {t}mm may be too thin for {d}mm vessel (min ~{min_t:.0f}mm)"
    return True, ""

def _check_head_compatibility(s):
    """Head type should be compatible with vessel."""
    head = s["head_type"]
    vessel = s["vessel_type"]
    
    # All head types work with both orientations
    return True, ""

class PressureVesselGrammar(DomainGrammar):
    @property
    def name(self): return "pressure_vessel"
    @property
    def display_name(self): return "Pressure Vessel"
    @property
    def description(self): return "Pressure vessels with ASME VIII heads"

    def param_specs(self):
        return [
            ParamSpec("vessel_type", "enum", None, "Vessel orientation", "horizontal", enum_options=["horizontal", "vertical"]),
            ParamSpec("diameter", "float", "mm", "Vessel diameter", 500, 100, 3000),
            ParamSpec("wall_thickness", "float", "mm", "Shell wall thickness", 10, 3, 50),
            ParamSpec("head_type", "enum", None, "Head type", "torispherical", enum_options=["torispherical", "ellipsoidal", "conical", "hemispherical"]),
            ParamSpec("dish_radius_factor", "float", None, "Torispherical dish radius factor", 0.8, 0.6, 1.0),
            ParamSpec("knuckle_radius_factor", "float", None, "Torispherical knuckle radius factor", 0.06, 0.03, 0.15),
            ParamSpec("length_between_heads", "float", "mm", "Length between heads", 1500, 200, 10000),
            ParamSpec("support_type", "enum", None, "Support type", "saddle", enum_options=["saddle", "leg", "skirt"]),
        ]

    def defaults(self):
        return {
            "vessel_type": "horizontal", "diameter": 500, "wall_thickness": 10,
            "head_type": "torispherical", "dish_radius_factor": 0.8,
            "knuckle_radius_factor": 0.06, "length_between_heads": 1500,
            "support_type": "saddle",
        }

    def constraints(self):
        return [
            Constraint("wall_thickness", "Wall thickness adequate for diameter",
                lambda s: _check_wall_thickness(s), severity="warning"),
            Constraint("head_compatibility", "Head type compatibility",
                lambda s: _check_head_compatibility(s), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Calculate head dimensions
        d = s["diameter"]
        t = s["wall_thickness"]
        
        if s["head_type"] == "torispherical":
            s["head_params"] = _torispherical_head_params(
                d, t, s["dish_radius_factor"], s["knuckle_radius_factor"]
            )
        elif s["head_type"] == "ellipsoidal":
            s["head_params"] = _ellipsoidal_head_params(d, t)
        elif s["head_type"] == "conical":
            s["head_params"] = _conical_head_params(d, t)
        elif s["head_type"] == "hemispherical":
            s["head_params"] = _hemispherical_head_params(d, t)
        
        return s

    def build(self, skeleton):
        s = skeleton
        diameter = s["diameter"]
        wall_thickness = s["wall_thickness"]
        length = s["length_between_heads"]
        vessel_type = s["vessel_type"]
        
        assy = cq.Assembly(name="ForgeOS_PressureVessel")
        
        # Build shell
        shell = _build_vessel_shell(diameter, wall_thickness, length)
        shell_color = cq.Color(0.5, 0.5, 0.55)
        assy.add(shell, loc=cq.Location(cq.Vector(0, 0, 0)), color=shell_color, name="Shell")
        
        # Build heads
        head_params = s.get("head_params")
        if head_params:
            head_depth = head_params.get("total_depth", wall_thickness * 4)
            
            if s["head_type"] == "torispherical":
                front_head = _build_torispherical_head(diameter, wall_thickness, head_params)
                rear_head = _build_torispherical_head(diameter, wall_thickness, head_params)
            elif s["head_type"] == "ellipsoidal":
                front_head = _build_ellipsoidal_head(diameter, wall_thickness, head_params)
                rear_head = _build_ellipsoidal_head(diameter, wall_thickness, head_params)
            elif s["head_type"] == "conical":
                front_head = _build_conical_head(diameter, wall_thickness, head_params)
                rear_head = _build_conical_head(diameter, wall_thickness, head_params)
            elif s["head_type"] == "hemispherical":
                front_head = _build_hemispherical_head(diameter, wall_thickness, head_params)
                rear_head = _build_hemispherical_head(diameter, wall_thickness, head_params)
            else:
                front_head = _build_torispherical_head(diameter, wall_thickness, head_params)
                rear_head = _build_torispherical_head(diameter, wall_thickness, head_params)
            
            if vessel_type == "horizontal":
                front_head = front_head.rotate((0, 0, 0), (1, 0, 0), 90)
                rear_head = rear_head.rotate((0, 0, 0), (1, 0, 0), -90)
                front_head = front_head.translate((0, 0, length / 2 + head_depth / 2))
                rear_head = rear_head.translate((0, 0, -length / 2 - head_depth / 2))
            else:  # vertical
                front_head = front_head.translate((0, 0, length / 2 + head_depth / 2))
                rear_head = rear_head.translate((0, 0, -length / 2 - head_depth / 2))
            
            assy.add(front_head, loc=cq.Location(cq.Vector(0, 0, 0)), color=shell_color, name="FrontHead")
            assy.add(rear_head, loc=cq.Location(cq.Vector(0, 0, 0)), color=shell_color, name="RearHead")
        
        # Add supports
        if s["support_type"] == "saddle" and vessel_type == "horizontal":
            saddle = _build_saddle_support(diameter, length)
            saddle = saddle.translate((0, -diameter / 2 - 10, 0))
            assy.add(saddle, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.4, 0.4, 0.45), name="SaddleSupport")
        elif s["support_type"] == "leg" and vessel_type == "vertical":
            leg = _build_leg_support(diameter, 200)
            for i in range(4):
                angle = math.pi / 2 * i
                x = (diameter / 2 + 30) * math.cos(angle)
                y = (diameter / 2 + 30) * math.sin(angle)
                leg_inst = leg.translate((x, y, -length / 2 - 100))
                assy.add(leg_inst, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.4, 0.4, 0.45), name=f"LegSupport{i+1}")
        elif s["support_type"] == "skirt" and vessel_type == "vertical":
            skirt = _build_skirt_support(diameter, 200)
            skirt = skirt.translate((0, 0, -length / 2 - 200))
            assy.add(skirt, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.4, 0.4, 0.45), name="SkirtSupport")
        
        return assy
$PYVESSEL$,

  -- Core library
  $PYCORE_VESSEL$
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
$PYCORE_VESSEL$,

  -- Param specs as JSON
  '[{"name":"vessel_type","type":"enum","unit":null,"description":"Vessel orientation","default":"horizontal","enum_options":["horizontal","vertical"]},{"name":"diameter","type":"float","unit":"mm","description":"Vessel diameter","default":500,"min_val":100,"max_val":3000},{"name":"wall_thickness","type":"float","unit":"mm","description":"Shell wall thickness","default":10,"min_val":3,"max_val":50},{"name":"head_type","type":"enum","unit":null,"description":"Head type","default":"torispherical","enum_options":["torispherical","ellipsoidal","conical","hemispherical"]},{"name":"dish_radius_factor","type":"float","unit":null,"description":"Torispherical dish radius factor","default":0.8,"min_val":0.6,"max_val":1.0},{"name":"knuckle_radius_factor","type":"float","unit":null,"description":"Torispherical knuckle radius factor","default":0.06,"min_val":0.03,"max_val":0.15},{"name":"length_between_heads","type":"float","unit":"mm","description":"Length between heads","default":1500,"min_val":200,"max_val":10000},{"name":"support_type","type":"enum","unit":null,"description":"Support type","default":"saddle","enum_options":["saddle","leg","skirt"]}]'::jsonb,

  -- Defaults as JSON
  '{"vessel_type":"horizontal","diameter":500,"wall_thickness":10,"head_type":"torispherical","dish_radius_factor":0.8,"knuckle_radius_factor":0.06,"length_between_heads":1500,"support_type":"saddle"}'::jsonb,

  'Wall thickness adequate for diameter (D/50 rule). Head types per ASME VIII.',
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


-- ─── Jig Fixture Grammar ───────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'jig_fixture',
  'Manufacturing Jig / Fixture',
  'Manufacturing jigs and fixtures for production assembly. Configurable base, datum locators, clamping method, and material selection.',
  ARRAY['jig', 'fixture', 'manufacturing jig', 'assembly fixture', 'clamping', 'dowel pin', 'kinematic', 'locator', 'toggle clamp', 'workholding', 'cnc fixture', 'welding fixture', 'assembly jig'],
  ARRAY[
    'Design a 300x200mm jig fixture with dowel locators',
    'Create a 4-toggle clamp fixture',
    'Build a kinematic mounting jig',
    'Make a 3-datum aluminum fixture',
    'Design a pneumatic clamping fixture'
  ],
  $PYJIG$
"""
ForgeOS Jig Fixture Grammar — Manufacturing Workholding
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

# Material properties
MATERIAL_PROPERTIES = {
    "aluminum": {"color": cq.Color(0.75, 0.75, 0.78), "density": 2.7},
    "steel": {"color": cq.Color(0.45, 0.45, 0.5), "density": 7.85},
    "delrin": {"color": cq.Color(0.9, 0.9, 0.9), "density": 1.41},
}

# Clamp styles
CLAMP_STYLES = {
    "toggle": {"height": 40, "base_size": 30},
    "cam": {"height": 35, "base_size": 25},
    "screw": {"height": 25, "base_size": 20},
    "pneumatic": {"height": 50, "base_size": 40},
}

# Locator styles
LOCATOR_STYLES = {
    "dowel": {"diameter": 10, "height": 15},
    "kinematic": {"diameter": 8, "height": 12},
    "slot": {"width": 12, "height": 10},
}

def _build_base(length, width, thickness, material):
    """Build fixture base plate."""
    base = cq.Workplane("XY").box(length, width, thickness)
    
    # Add reinforcement ribs
    rib_count = 3
    rib_height = thickness * 0.4
    rib_thickness = 4
    
    for i in range(rib_count + 1):
        y = -width / 2 + (width / rib_count) * i
        if abs(y) < width / 2 - 10:
            rib = cq.Workplane("XY").box(length - 20, rib_thickness, rib_height)
            rib = rib.translate((0, y, thickness / 2 + rib_height / 2))
            base = base.union(rib)
    
    return base

def _add_datum_locator(base, x, y, locator_type, height=15):
    """Add datum locator to base."""
    params = LOCATOR_STYLES.get(locator_type, LOCATOR_STYLES["dowel"])
    
    if locator_type == "slot":
        locator = cq.Workplane("XY").box(params["width"], 30, params["height"])
    else:
        locator = cq.Workplane("XY").circle(params["diameter"] / 2).extrude(params["height"])
    
    locator = locator.translate((x, y, 0))
    
    return locator

def _add_clamp(base, x, y, clamp_type, material):
    """Add clamp to fixture."""
    params = CLAMP_STYLES.get(clamp_type, CLAMP_STYLES["toggle"])
    
    if clamp_type == "toggle":
        # Toggle clamp assembly
        clamp_body = cq.Workplane("XY").box(params["base_size"], params["base_size"], params["height"] * 0.6)
        clamp_arm = cq.Workplane("XY").box(20, 8, 6)
        clamp_arm = clamp_arm.translate((10, 0, params["height"] * 0.6 + 3))
        clamp = clamp_body.union(clamp_arm)
        
        # Handle
        handle = cq.Workplane("XY").circle(4).extrude(60)
        handle = handle.rotate((0, 0, 0), (1, 0, 0), 90)
        handle = handle.translate((0, 0, params["height"] * 0.6 + 10))
        clamp = clamp.union(handle)
        
    elif clamp_type == "cam":
        # Cam clamp
        clamp_body = cq.Workplane("XY").box(params["base_size"], params["base_size"], params["height"] * 0.5)
        cam = cq.Workplane("XY").box(15, 30, 8)
        cam = cam.rotate((0, 0, 0), (0, 0, 1), 30)
        cam = cam.translate((5, 5, params["height"] * 0.5))
        clamp = clamp_body.union(cam)
        
    elif clamp_type == "screw":
        # Screw clamp
        clamp_body = cq.Workplane("XY").box(params["base_size"], params["base_size"], 10)
        screw = cq.Workplane("XY").circle(8).extrude(params["height"])
        screw = screw.translate((0, 0, 10))
        clamp = clamp_body.union(screw)
        
        # Knob
        knob = cq.Workplane("XY").circle(15).extrude(8)
        knob = knob.translate((0, 0, params["height"] + 8))
        clamp = clamp.union(knob)
        
    else:  # pneumatic
        # Pneumatic cylinder
        clamp_body = cq.Workplane("XY").circle(params["base_size"] / 2).extrude(params["height"] * 0.4)
        cylinder = cq.Workplane("XY").circle(20).extrude(params["height"] * 0.6)
        cylinder = cylinder.translate((0, 0, params["height"] * 0.4))
        clamp = clamp_body.union(cylinder)
        
        # Fitting
        fitting = cq.Workplane("XY").circle(6).extrude(15)
        fitting = fitting.translate((15, 0, params["height"] * 0.4))
        clamp = clamp.union(fitting)
    
    clamp = clamp.translate((x, y, 0))
    
    return clamp

def _check_clamp_count(s):
    """Clamp count should be reasonable."""
    clamps = s["clamp_count"]
    if clamps < 1:
        return False, f"Need at least 1 clamp"
    if clamps > 12:
        return False, f"Maximum 12 clamps recommended"
    return True, ""

def _check_locator_count(s):
    """Locator count should match datum requirements."""
    locators = s.get("locator_count", 3)
    if locators < 3:
        return False, f"Need at least 3 datums for 2D location"
    if locators > 6:
        return False, f"Maximum 6 locators recommended"
    return True, ""

class JigFixtureGrammar(DomainGrammar):
    @property
    def name(self): return "jig_fixture"
    @property
    def display_name(self): return "Manufacturing Jig / Fixture"
    @property
    def description(self): return "Manufacturing jigs and fixtures for production"

    def param_specs(self):
        return [
            ParamSpec("base_length", "float", "mm", "Base length (X)", 300, 100, 1000),
            ParamSpec("base_width", "float", "mm", "Base width (Y)", 200, 100, 800),
            ParamSpec("base_thickness", "float", "mm", "Base thickness", 25, 10, 100),
            ParamSpec("datum_surface", "enum", None, "Primary datum surface", "bottom", enum_options=["bottom", "front", "side"]),
            ParamSpec("locator_style", "enum", None, "Locator type", "dowel", enum_options=["dowel", "kinematic", "slot"]),
            ParamSpec("locator_count", "int", None, "Number of datum locators", 3, 3, 6),
            ParamSpec("clamp_count", "int", None, "Number of clamps", 4, 1, 12),
            ParamSpec("clamping_method", "enum", None, "Clamping method", "toggle", enum_options=["toggle", "cam", "screw", "pneumatic"]),
            ParamSpec("fixture_material", "enum", None, "Fixture material", "aluminum", enum_options=["aluminum", "steel", "delrin"]),
        ]

    def defaults(self):
        return {
            "base_length": 300, "base_width": 200, "base_thickness": 25,
            "datum_surface": "bottom", "locator_style": "dowel", "locator_count": 3,
            "clamp_count": 4, "clamping_method": "toggle", "fixture_material": "aluminum",
        }

    def constraints(self):
        return [
            Constraint("clamp_count_valid", "Clamp count 1-12",
                lambda s: _check_clamp_count(s), severity="error"),
            Constraint("locator_count_valid", "Locator count 3-6",
                lambda s: _check_locator_count(s), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        
        # Get material properties
        s["material_props"] = MATERIAL_PROPERTIES.get(s["fixture_material"], MATERIAL_PROPERTIES["aluminum"])
        s["clamp_params"] = CLAMP_STYLES.get(s["clamping_method"], CLAMP_STYLES["toggle"])
        
        # Calculate locator positions (3-2-1 principle)
        locators = s["locator_count"]
        length = s["base_length"]
        width = s["base_width"]
        
        locator_positions = []
        
        if locators >= 3:
            # Primary datum (3 points along edge)
            for i in range(min(3, locators)):
                x = -length / 2 + 30 + (length - 60) * i / 2
                y = -width / 2 + 20
                locator_positions.append((x, y, "primary"))
        
        if locators >= 4:
            # Secondary datum (2 points)
            x = length / 2 - 30
            for i in range(min(2, locators - 3 + 1)):
                y = -width / 2 + 30 + (width - 60) * i
                locator_positions.append((x, y, "secondary"))
        
        if locators >= 6:
            # Tertiary datum (1 point)
            x = length / 2 - 30
            y = width / 2 - 20
            locator_positions.append((x, y, "tertiary"))
        
        s["locator_positions"] = locator_positions
        
        # Calculate clamp positions
        clamps = s["clamp_count"]
        clamp_positions = []
        
        for i in range(clamps):
            angle = 2 * math.pi * i / clamps
            x = (length / 2 - 30) * math.cos(angle)
            y = (width / 2 - 30) * math.sin(angle)
            # Clamp around the perimeter
            clamp_positions.append((x * 0.9, y * 0.9))
        
        s["clamp_positions"] = clamp_positions
        
        return s

    def build(self, skeleton):
        s = skeleton
        length = s["base_length"]
        width = s["base_width"]
        thickness = s["base_thickness"]
        
        assy = cq.Assembly(name="ForgeOS_JigFixture")
        
        material_props = s["material_props"]
        material_color = material_props["color"]
        
        # Build base
        base = _build_base(length, width, thickness, s["fixture_material"])
        assy.add(base, loc=cq.Location(cq.Vector(0, 0, 0)), color=material_color, name="BasePlate")
        
        # Add datum locators
        for i, (x, y, datum_type) in enumerate(s["locator_positions"]):
            locator = _add_datum_locator(base, x, y, s["locator_style"])
            color = cq.Color(0.3, 0.3, 0.35) if datum_type == "primary" else material_color
            assy.add(locator, loc=cq.Location(cq.Vector(0, 0, thickness)), color=color, name=f"Locator{datum_type.capitalize()}{i+1}")
        
        # Add clamps
        clamp_params = s["clamp_params"]
        for i, (x, y) in enumerate(s["clamp_positions"]):
            clamp = _add_clamp(base, x, y, s["clamping_method"], s["fixture_material"])
            clamp_color = cq.Color(0.4, 0.4, 0.45)  # Steel for clamps
            assy.add(clamp, loc=cq.Location(cq.Vector(0, 0, thickness)), color=clamp_color, name=f"Clamp{i+1}")
        
        return assy
$PYJIG$,

  -- Core library
  $PYCORE_JIG$
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
$PYCORE_JIG$,

  -- Param specs as JSON
  '[{"name":"base_length","type":"float","unit":"mm","description":"Base length (X)","default":300,"min_val":100,"max_val":1000},{"name":"base_width","type":"float","unit":"mm","description":"Base width (Y)","default":200,"min_val":100,"max_val":800},{"name":"base_thickness","type":"float","unit":"mm","description":"Base thickness","default":25,"min_val":10,"max_val":100},{"name":"datum_surface","type":"enum","unit":null,"description":"Primary datum surface","default":"bottom","enum_options":["bottom","front","side"]},{"name":"locator_style","type":"enum","unit":null,"description":"Locator type","default":"dowel","enum_options":["dowel","kinematic","slot"]},{"name":"locator_count","type":"int","unit":null,"description":"Number of datum locators","default":3,"min_val":3,"max_val":6},{"name":"clamp_count","type":"int","unit":null,"description":"Number of clamps","default":4,"min_val":1,"max_val":12},{"name":"clamping_method","type":"enum","unit":null,"description":"Clamping method","default":"toggle","enum_options":["toggle","cam","screw","pneumatic"]},{"name":"fixture_material","type":"enum","unit":null,"description":"Fixture material","default":"aluminum","enum_options":["aluminum","steel","delrin"]}]'::jsonb,

  -- Defaults as JSON
  '{"base_length":300,"base_width":200,"base_thickness":25,"datum_surface":"bottom","locator_style":"dowel","locator_count":3,"clamp_count":4,"clamping_method":"toggle","fixture_material":"aluminum"}'::jsonb,

  'Clamp count 1-12. Locator count 3-6 for 3-2-1 datum principle.',
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
