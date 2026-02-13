-- ═══════════════════════════════════════════════════════════════
-- Seed CAD Grammars: Building + Drone
-- ═══════════════════════════════════════════════════════════════
-- Python source code is stored using dollar-quoting to avoid escaping.
-- The core_library_code is the base class framework (grammar.py).
-- The python_code is the domain-specific grammar.

-- ─── Building Grammar ────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'building',
  'Building / Architecture',
  'Residential timber-frame buildings with BIM-aligned geometry. Walls by centreline + thickness, openings as boolean cuts, pentagon gable profiles, roof from cross-section extrusion. UK Building Regulations compliant.',
  ARRAY['house', 'building', 'residential', 'construction', 'architecture', 'timber frame', 'cottage', 'cabin', 'dwelling', 'bungalow', 'home', 'shed', 'garage', 'workshop', 'barn', 'office building'],
  ARRAY[
    'Design a 3-bedroom house',
    'Build a small timber-frame cottage',
    'Create a residential building 12m long',
    'Design a single-storey bungalow',
    'Make a workshop building with a loft',
    'Create a garden office shed',
    'Design a barn conversion layout'
  ],
  $PYBUILDING$
"""
ForgeOS Building Grammar — BIM-Aligned House Design
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

@dataclass
class OpeningSpec:
    position_along_wall: float
    sill_height: float
    width: float
    height: float
    type: str = "window"

@dataclass
class WallSpec:
    name: str
    start: Tuple[float, float]
    end: Tuple[float, float]
    height: float
    thickness: float
    is_gable: bool = False
    ridge_height: float = 0
    openings: List[OpeningSpec] = None
    color: Tuple[float, float, float] = (0.92, 0.90, 0.85)
    def __post_init__(self):
        if self.openings is None:
            self.openings = []
    @property
    def length(self) -> float:
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        return math.sqrt(dx * dx + dy * dy)

@dataclass
class SlabSpec:
    name: str
    centre_x: float
    centre_y: float
    z: float
    length: float
    width: float
    thickness: float
    color: Tuple[float, float, float] = (0.60, 0.58, 0.55)

@dataclass
class RoofSpec:
    ridge_length: float
    half_span: float
    rise: float
    thickness: float
    eaves_z: float
    overhang_drop: float
    offset_x: float
    centre_y: float

def _build_rect_wall(length, height, thickness):
    return cq.Workplane("XY").box(length, thickness, height, centered=(True, True, False))

def _build_gable_wall(width, eaves_z, ridge_z, thickness):
    pts = [(0, 0), (width, 0), (width, eaves_z), (width / 2, ridge_z), (0, eaves_z)]
    return cq.Workplane("YZ").polyline(pts).close().extrude(thickness)

def _cut_opening(wall, cx, cy, cz, width, height, depth):
    cutter = cq.Workplane("XY").box(width, depth, height, centered=(True, True, True)).translate((cx, cy, cz))
    return wall.cut(cutter)

def _build_roof_profile(half_span, rise, overhang_drop, thickness, ridge_length):
    pts = [(-half_span, -overhang_drop), (0, rise), (half_span, -overhang_drop),
           (half_span, -overhang_drop - thickness), (0, rise - thickness), (-half_span, -overhang_drop - thickness)]
    return cq.Workplane("YZ").polyline(pts).close().extrude(ridge_length)

def _build_staircase(total_rise, total_going, width, num_risers):
    riser_h = total_rise / num_risers
    tread_d = total_going / num_risers
    pts = [(0, 0)]
    for i in range(num_risers):
        pts.append((i * tread_d, (i + 1) * riser_h))
        pts.append(((i + 1) * tread_d, (i + 1) * riser_h))
    pts.append((total_going, 0))
    return cq.Workplane("XZ").polyline(pts).close().extrude(width)

def _parse_opening(d):
    return OpeningSpec(
        position_along_wall=d.get("position_along_wall", 0),
        sill_height=d.get("sill_height"),
        width=d.get("width", 1000),
        height=d.get("height", 1000),
        type=d.get("type", "window"))

def _check_stair_geometry(s):
    if not s.get("has_loft"):
        return True, ""
    val = s.get("stair_2r_plus_g", 0)
    if 550 <= val <= 700:
        return True, ""
    return False, f"2R+G = {val:.0f}mm (should be 550-700mm)"

class BuildingGrammar(DomainGrammar):
    @property
    def name(self): return "building"
    @property
    def display_name(self): return "Building / Architecture"
    @property
    def description(self): return "Residential timber-frame buildings with BIM-aligned geometry"

    def param_specs(self):
        return [
            ParamSpec("length", "float", "mm", "Overall building length (X axis)", 12000, 3000, 30000),
            ParamSpec("width", "float", "mm", "Overall building width (Y axis)", 3658, 2400, 12000),
            ParamSpec("ridge_height", "float", "mm", "Ridge height from finished floor level", 6000, 3000, 15000),
            ParamSpec("roof_pitch_deg", "float", "degrees", "Roof pitch angle", 20.0, 5.0, 60.0),
            ParamSpec("ext_wall_thickness", "float", "mm", "Exterior wall thickness", 195, 100, 400),
            ParamSpec("int_wall_thickness", "float", "mm", "Interior partition thickness", 114, 75, 200),
            ParamSpec("roof_thickness", "float", "mm", "Roof shell thickness (vertical)", 200, 100, 400),
            ParamSpec("roof_overhang", "float", "mm", "Roof overhang beyond wall face", 200, 0, 600),
            ParamSpec("ground_floor_height", "float", "mm", "Ground floor ceiling height", 3000, 2400, 4000),
            ParamSpec("has_loft", "bool", None, "Include loft floor and staircase", True),
            ParamSpec("loft_length", "float", "mm", "Loft floor length (from right gable inward)", 5000, 2000, None),
            ParamSpec("partition_positions", "list", "mm", "X positions of internal partitions", None),
            ParamSpec("front_openings", "dict_list", None, "Front wall openings", None),
            ParamSpec("rear_openings", "dict_list", None, "Rear wall openings", None),
            ParamSpec("left_openings", "dict_list", None, "Left gable openings", None),
            ParamSpec("right_openings", "dict_list", None, "Right gable openings", None),
        ]

    def defaults(self):
        return {
            "length": 12000, "width": 3658, "ridge_height": 6000, "roof_pitch_deg": 20.0,
            "ext_wall_thickness": 195, "int_wall_thickness": 114, "roof_thickness": 200,
            "roof_overhang": 200, "ground_floor_height": 3000, "has_loft": True, "loft_length": 5000,
            "partition_positions": [5300, 8000, 10000],
            "front_openings": [
                {"position_along_wall": 1500, "sill_height": 0, "width": 1070, "height": 2100, "type": "door"},
                {"position_along_wall": 3500, "sill_height": 900, "width": 1220, "height": 1420, "type": "window"},
                {"position_along_wall": 5000, "sill_height": 900, "width": 1220, "height": 1420, "type": "window"}],
            "rear_openings": [
                {"position_along_wall": 10500, "sill_height": 0, "width": 920, "height": 2100, "type": "door"},
                {"position_along_wall": 6700, "sill_height": 900, "width": 1020, "height": 1020, "type": "window"}],
            "left_openings": [
                {"sill_height": 900, "width": 1020, "height": 1020, "type": "window"},
                {"sill_height": None, "width": 820, "height": 1020, "type": "window"}],
            "right_openings": [{"sill_height": None, "width": 820, "height": 1020, "type": "window"}],
        }

    def constraints(self):
        return [
            Constraint("min_ceiling_height", "UK Building Regs: habitable rooms min 2100mm",
                lambda s: (s["ground_floor_height"] >= 2100, f"Floor height {s['ground_floor_height']}mm < 2100mm minimum"), severity="error"),
            Constraint("stair_geometry", "UK Part K: 2R + G must be 550-700mm",
                lambda s: _check_stair_geometry(s), severity="warning"),
            Constraint("roof_pitch_range", "Roof pitch must be reasonable",
                lambda s: (5 <= s["roof_pitch_deg"] <= 60, f"Pitch {s['roof_pitch_deg']} outside 5-60 range"), severity="warning"),
            Constraint("ridge_above_eaves", "Ridge must be above eaves line",
                lambda s: (s["ridge_height"] > s["eaves_height"], f"Ridge {s['ridge_height']}mm <= eaves {s['eaves_height']}mm"), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        L, W = s["length"], s["width"]
        pitch = math.radians(s["roof_pitch_deg"])
        ext_t = s["ext_wall_thickness"]
        s["roof_rise"] = (W / 2) * math.tan(pitch)
        s["eaves_height"] = s["ridge_height"] - s["roof_rise"]
        s["interior_width"] = W - 2 * ext_t
        overhang = s["roof_overhang"]
        s["roof_total_width"] = W + 2 * overhang
        s["roof_half_span"] = s["roof_total_width"] / 2
        s["roof_overhang_drop"] = overhang * math.tan(pitch)
        s["roof_ridge_length"] = L + 2 * overhang
        s["roof_secant_thickness"] = s["roof_thickness"] / math.cos(pitch)
        if s.get("has_loft"):
            s["loft_x_start"] = L - ext_t - s["loft_length"]
            s["stair_total_rise"] = s["ground_floor_height"] + 250
            s["stair_num_risers"] = 15
            s["stair_total_going"] = s["stair_num_risers"] * 220
            s["stair_width"] = 800
            s["stair_riser_height"] = s["stair_total_rise"] / s["stair_num_risers"]
            s["stair_going"] = s["stair_total_going"] / s["stair_num_risers"]
            s["stair_2r_plus_g"] = 2 * s["stair_riser_height"] + s["stair_going"]
        s["foundation_length"] = L + 200
        s["foundation_width"] = W + 200
        s["foundation_thickness"] = 200
        s["ground_slab_thickness"] = 150
        return s

    def build(self, skeleton):
        s = skeleton
        L, W = s["length"], s["width"]
        ext_t, int_t = s["ext_wall_thickness"], s["int_wall_thickness"]
        int_w, eaves, ridge = s["interior_width"], s["eaves_height"], s["ridge_height"]
        gf_h = s["ground_floor_height"]
        house = cq.Assembly(name="ForgeOS_House")
        house.add(cq.Workplane("XY").box(s["foundation_length"], s["foundation_width"], s["foundation_thickness"], centered=(True, True, False)),
            loc=cq.Location(cq.Vector(L/2, W/2, -s["foundation_thickness"])), color=cq.Color(0.50, 0.50, 0.50), name="Foundation")
        house.add(cq.Workplane("XY").box(L, W, s["ground_slab_thickness"], centered=(True, True, False)),
            loc=cq.Location(cq.Vector(L/2, W/2, -s["ground_slab_thickness"])), color=cq.Color(0.60, 0.58, 0.55), name="GroundSlab")
        fw = _build_rect_wall(L, eaves, ext_t)
        for op_dict in s.get("front_openings", []):
            op = _parse_opening(op_dict)
            fw = _cut_opening(fw, -L/2 + op.position_along_wall, 0, op.sill_height + op.height/2, op.width, op.height, ext_t + 100)
        house.add(fw, loc=cq.Location(cq.Vector(L/2, ext_t/2, 0)), color=cq.Color(0.92, 0.90, 0.85), name="FrontWall")
        rw = _build_rect_wall(L, eaves, ext_t)
        for op_dict in s.get("rear_openings", []):
            op = _parse_opening(op_dict)
            rw = _cut_opening(rw, -L/2 + op.position_along_wall, 0, op.sill_height + op.height/2, op.width, op.height, ext_t + 100)
        house.add(rw, loc=cq.Location(cq.Vector(L/2, W - ext_t/2, 0)), color=cq.Color(0.92, 0.90, 0.85), name="RearWall")
        lw = _build_gable_wall(W, eaves, ridge, ext_t)
        for op_dict in s.get("left_openings", []):
            op = _parse_opening(op_dict)
            sill = op.sill_height if op.sill_height is not None else eaves - 200
            lw = _cut_opening(lw, ext_t/2, W/2, sill + op.height/2, ext_t + 100, op.width, op.height)
        house.add(lw, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.92, 0.90, 0.85), name="LeftGableWall")
        rg = _build_gable_wall(W, eaves, ridge, ext_t)
        for op_dict in s.get("right_openings", []):
            op = _parse_opening(op_dict)
            sill = op.sill_height if op.sill_height is not None else gf_h + 400
            rg = _cut_opening(rg, ext_t/2, W/2, sill + op.height/2, ext_t + 100, op.width, op.height)
        house.add(rg, loc=cq.Location(cq.Vector(L - ext_t, 0, 0)), color=cq.Color(0.92, 0.90, 0.85), name="RightGableWall")
        for i, px in enumerate(s.get("partition_positions", [])):
            part = _build_rect_wall(int_w, gf_h, int_t)
            part = _cut_opening(part, 0, 0, 2032/2, 833, 2032, int_t + 100)
            loc = cq.Location(cq.Vector(px, W/2, 0)) * cq.Location(cq.Vector(0, 0, 0), cq.Vector(0, 0, 1), 90)
            house.add(part, loc=loc, color=cq.Color(0.95, 0.93, 0.90), name=f"Partition_{i+1}")
        roof = _build_roof_profile(s["roof_half_span"], s["roof_rise"], s["roof_overhang_drop"], s["roof_thickness"], s["roof_ridge_length"])
        house.add(roof, loc=cq.Location(cq.Vector(-s["roof_overhang"], W/2, eaves)), color=cq.Color(0.30, 0.25, 0.22), name="Roof")
        if s.get("has_loft"):
            loft_len, loft_x = s["loft_length"], s["loft_x_start"]
            house.add(cq.Workplane("XY").box(loft_len, int_w, 250, centered=(True, True, False)),
                loc=cq.Location(cq.Vector(loft_x + loft_len/2, W/2, gf_h)), color=cq.Color(0.82, 0.72, 0.58), name="LoftFloor")
            ceil_len = loft_x - ext_t
            if ceil_len > 0:
                house.add(cq.Workplane("XY").box(ceil_len, int_w, 220, centered=(True, True, False)),
                    loc=cq.Location(cq.Vector(ext_t + ceil_len/2, W/2, gf_h)), color=cq.Color(0.94, 0.92, 0.88), name="CeilingSlab")
            house.add(cq.Workplane("XY").box(50, int_w, 914, centered=(True, True, False)),
                loc=cq.Location(cq.Vector(loft_x, W/2, gf_h + 250)), color=cq.Color(0.6, 0.6, 0.6), name="LoftGuardrail")
            stair = _build_staircase(s["stair_total_rise"], s["stair_total_going"], s["stair_width"], s["stair_num_risers"])
            stair_x = loft_x - s["stair_total_going"]
            stair_y = W - ext_t - s["stair_width"]
            house.add(stair, loc=cq.Location(cq.Vector(stair_x, stair_y, 0)), color=cq.Color(0.72, 0.60, 0.48), name="Staircase")
            angle = math.degrees(math.atan2(s["stair_total_rise"], s["stair_total_going"]))
            rail_len = math.sqrt(s["stair_total_going"]**2 + s["stair_total_rise"]**2)
            handrail = cq.Workplane("XY").box(rail_len, 40, 50, centered=(True, True, False))
            rail_loc = cq.Location(cq.Vector(stair_x + s["stair_total_going"]/2, stair_y, s["stair_total_rise"]/2 + 900)) * cq.Location(cq.Vector(0,0,0), cq.Vector(0,1,0), -angle)
            house.add(handrail, loc=rail_loc, color=cq.Color(0.55, 0.55, 0.55), name="Handrail")
        return house
$PYBUILDING$,

  -- Core library (grammar.py base classes)
  $PYCORE$
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
$PYCORE$,

  -- Param specs as JSON
  '[
    {"name":"length","type":"float","unit":"mm","description":"Overall building length (X axis)","default":12000,"min_val":3000,"max_val":30000},
    {"name":"width","type":"float","unit":"mm","description":"Overall building width (Y axis)","default":3658,"min_val":2400,"max_val":12000},
    {"name":"ridge_height","type":"float","unit":"mm","description":"Ridge height from finished floor level","default":6000,"min_val":3000,"max_val":15000},
    {"name":"roof_pitch_deg","type":"float","unit":"degrees","description":"Roof pitch angle","default":20.0,"min_val":5.0,"max_val":60.0},
    {"name":"ext_wall_thickness","type":"float","unit":"mm","description":"Exterior wall thickness","default":195,"min_val":100,"max_val":400},
    {"name":"int_wall_thickness","type":"float","unit":"mm","description":"Interior partition thickness","default":114,"min_val":75,"max_val":200},
    {"name":"roof_thickness","type":"float","unit":"mm","description":"Roof shell thickness (vertical)","default":200,"min_val":100,"max_val":400},
    {"name":"roof_overhang","type":"float","unit":"mm","description":"Roof overhang beyond wall face","default":200,"min_val":0,"max_val":600},
    {"name":"ground_floor_height","type":"float","unit":"mm","description":"Ground floor ceiling height","default":3000,"min_val":2400,"max_val":4000},
    {"name":"has_loft","type":"bool","unit":null,"description":"Include loft floor and staircase","default":true},
    {"name":"loft_length","type":"float","unit":"mm","description":"Loft floor length (from right gable inward)","default":5000,"min_val":2000,"max_val":null},
    {"name":"partition_positions","type":"list","unit":"mm","description":"X positions of internal partitions","default":null},
    {"name":"front_openings","type":"dict_list","unit":null,"description":"Front wall openings","default":null},
    {"name":"rear_openings","type":"dict_list","unit":null,"description":"Rear wall openings","default":null},
    {"name":"left_openings","type":"dict_list","unit":null,"description":"Left gable openings","default":null},
    {"name":"right_openings","type":"dict_list","unit":null,"description":"Right gable openings","default":null}
  ]'::jsonb,

  -- Defaults as JSON
  '{"length":12000,"width":3658,"ridge_height":6000,"roof_pitch_deg":20.0,"ext_wall_thickness":195,"int_wall_thickness":114,"roof_thickness":200,"roof_overhang":200,"ground_floor_height":3000,"has_loft":true,"loft_length":5000,"partition_positions":[5300,8000,10000]}'::jsonb,

  'Min ceiling height 2100mm (UK Regs). Stair 2R+G 550-700mm (Part K). Roof pitch 5-60 degrees. Ridge must be above eaves.',
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


-- ─── Drone Grammar ───────────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'drone',
  'FPV Quadcopter',
  'FPV racing/freestyle quadcopter frames in X-configuration. Prop size drives all dimensions. CNC carbon fibre or 3D-printed. Motor presets, FC stack sizing, prop clearance validation.',
  ARRAY['drone', 'quadcopter', 'fpv', 'racing drone', 'multirotor', 'uav', 'quadrotor', 'freestyle drone', 'mini quad', 'micro drone', 'cinewhoop', 'toothpick'],
  ARRAY[
    'Design a 5-inch FPV racing drone',
    'Build a 3-inch micro quadcopter frame',
    'Create a 7-inch long range drone',
    'Design a carbon fibre drone frame',
    'Make a cinewhoop-style drone',
    'Build a freestyle quad with 2306 motors'
  ],
  $PYDRONE$
"""
ForgeOS Drone Grammar — FPV Quadcopter Design
"""
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq

@dataclass
class MotorSpec:
    name: str
    stator_diameter: float
    stator_height: float
    bolt_pattern: float
    bolt_size: str
    shaft_diameter: float = 5.0
    bell_diameter: float = 28.0
    height: float = 32.0
    weight: float = 30.0
    @property
    def bolt_hole_positions(self):
        half = self.bolt_pattern / 2
        return [(-half, -half), (-half, half), (half, -half), (half, half)]

@dataclass
class FCStackSpec:
    name: str
    hole_spacing: float
    bolt_size: str
    board_width: float = 36.0
    board_length: float = 36.0
    stack_height: float = 20.0
    @property
    def bolt_hole_positions(self):
        half = self.hole_spacing / 2
        return [(-half, -half), (-half, half), (half, -half), (half, half)]

MOTOR_PRESETS = {
    "1404": MotorSpec("1404", 14, 4, 9, "M2", 1.5, 18, 15, 10),
    "2004": MotorSpec("2004", 20, 4, 16, "M3", 5.0, 24, 20, 18),
    "2207": MotorSpec("2207", 22, 7, 16, "M3", 5.0, 28, 30, 30),
    "2306": MotorSpec("2306", 23, 6, 16, "M3", 5.0, 28, 32, 33),
    "2806": MotorSpec("2806", 28, 6, 19, "M3", 5.0, 34, 35, 45),
}
FC_PRESETS = {
    "20mm": FCStackSpec("20x20 Mini", 20, "M2", 26, 26, 15),
    "25.5mm": FCStackSpec("25.5x25.5 Whoop", 25.5, "M2", 30, 30, 15),
    "30.5mm": FCStackSpec("30.5x30.5 Standard", 30.5, "M3", 36, 36, 20),
}

def _build_centre_plate(length, width, thickness, corner_r, stack_holes, stack_bolt_d, standoff_holes=None, standoff_bolt_d=3.2):
    plate = cq.Workplane("XY").rect(length, width).extrude(thickness)
    if corner_r > 0:
        try: plate = plate.edges("|Z").fillet(corner_r)
        except Exception: pass
    for (hx, hy) in stack_holes:
        hole = cq.Workplane("XY").circle(stack_bolt_d / 2).extrude(thickness * 3)
        plate = plate.cut(hole.translate((hx, hy, -thickness)))
    if standoff_holes:
        for (hx, hy) in standoff_holes:
            hole = cq.Workplane("XY").circle(standoff_bolt_d / 2).extrude(thickness * 3)
            plate = plate.cut(hole.translate((hx, hy, -thickness)))
    return plate

def _build_arm(length, root_width, tip_width, thickness, motor_bolt_pattern, motor_bolt_d):
    pts = [(0, -root_width/2), (length, -tip_width/2), (length, tip_width/2), (0, root_width/2)]
    arm = cq.Workplane("XY").polyline(pts).close().extrude(thickness)
    half_bolt = motor_bolt_pattern / 2
    for dx, dy in [(-half_bolt, -half_bolt), (-half_bolt, half_bolt), (half_bolt, -half_bolt), (half_bolt, half_bolt)]:
        hole = cq.Workplane("XY").circle(motor_bolt_d / 2).extrude(thickness * 3)
        arm = arm.cut(hole.translate((length + dx, dy, -thickness)))
    return arm

def _build_standoff(height, outer_d=6.0, inner_d=3.2):
    return cq.Workplane("XY").circle(outer_d/2).circle(inner_d/2).extrude(height)

def _build_motor_proxy(spec):
    motor = cq.Workplane("XY").circle(spec.bell_diameter/2).extrude(spec.height)
    shaft = cq.Workplane("XY").circle(spec.shaft_diameter/2).extrude(spec.height + 5)
    return motor.union(shaft)

def _build_prop_disc(diameter, thickness=1.0):
    return cq.Workplane("XY").circle(diameter/2).extrude(thickness)

def _check_prop_clearance(s):
    positions = s.get("motor_positions", [])
    prop_r = s.get("prop_diameter_mm", 0) / 2
    clearance = s.get("prop_clearance_mm", 5)
    for i in range(len(positions)):
        for j in range(i+1, len(positions)):
            dx = positions[i][0] - positions[j][0]
            dy = positions[i][1] - positions[j][1]
            dist = math.sqrt(dx*dx + dy*dy)
            min_dist = 2 * prop_r + clearance
            if dist < min_dist:
                return False, f"Motors {i+1} and {j+1}: distance {dist:.1f}mm < required {min_dist:.1f}mm"
    return True, ""

class DroneGrammar(DomainGrammar):
    @property
    def name(self): return "drone"
    @property
    def display_name(self): return "FPV Quadcopter"
    @property
    def description(self): return "FPV racing/freestyle quadcopter frames (X-configuration)"

    def param_specs(self):
        return [
            ParamSpec("prop_size_inch", "float", "inch", "Propeller diameter", 5.0, 2.0, 10.0),
            ParamSpec("motor_size", "enum", None, "Motor stator size", "2306", enum_options=list(MOTOR_PRESETS.keys())),
            ParamSpec("fc_stack_size", "enum", None, "Flight controller stack mounting pattern", "30.5mm", enum_options=list(FC_PRESETS.keys())),
            ParamSpec("frame_material", "enum", None, "Frame material", "carbon_fibre", enum_options=["carbon_fibre", "3d_print_tpu", "3d_print_petg"]),
            ParamSpec("arm_thickness", "float", "mm", "Arm plate thickness", None, 3.0, 8.0),
            ParamSpec("top_plate_thickness", "float", "mm", "Top plate thickness", 2.0, 1.5, 4.0),
            ParamSpec("bottom_plate_thickness", "float", "mm", "Bottom plate thickness", 2.0, 1.5, 4.0),
            ParamSpec("standoff_height", "float", "mm", "Standoff height between plates", 25.0, 15.0, 40.0),
            ParamSpec("camera_tilt_deg", "float", "degrees", "FPV camera tilt angle", 25.0, 0.0, 45.0),
            ParamSpec("prop_clearance_mm", "float", "mm", "Minimum clearance between prop tips", 8.0, 3.0, 20.0),
            ParamSpec("config_type", "enum", None, "Arm configuration", "true_x", enum_options=["true_x", "stretch_x", "squished_x", "deadcat"]),
        ]

    def defaults(self):
        return {
            "prop_size_inch": 5.0, "motor_size": "2306", "fc_stack_size": "30.5mm",
            "frame_material": "carbon_fibre", "arm_thickness": None, "top_plate_thickness": 2.0,
            "bottom_plate_thickness": 2.0, "standoff_height": 25.0, "camera_tilt_deg": 25.0,
            "prop_clearance_mm": 8.0, "config_type": "true_x",
        }

    def constraints(self):
        return [
            Constraint("prop_clearance", "Prop tips must not overlap",
                lambda s: _check_prop_clearance(s), severity="error"),
            Constraint("motor_fits_arm", "Motor bell must fit within arm tip width",
                lambda s: (s["arm_tip_width"] >= s["motor_bell_d"] + 2,
                    f"Arm tip {s['arm_tip_width']:.0f}mm < motor bell {s['motor_bell_d']:.0f}mm + 2mm"), severity="error"),
            Constraint("stack_fits_plates", "FC stack must fit within centre plate",
                lambda s: (s["centre_plate_width"] >= s["fc_board_width"] + 4,
                    f"Plate width {s['centre_plate_width']:.0f}mm < FC board {s['fc_board_width']:.0f}mm + 4mm"), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        motor = MOTOR_PRESETS[s["motor_size"]]
        fc = FC_PRESETS[s["fc_stack_size"]]
        s["motor_bell_d"] = motor.bell_diameter
        s["motor_bolt_pattern"] = motor.bolt_pattern
        s["motor_bolt_size"] = motor.bolt_size
        s["motor_height"] = motor.height
        s["fc_hole_spacing"] = fc.hole_spacing
        s["fc_board_width"] = fc.board_width
        s["fc_board_length"] = fc.board_length
        s["fc_bolt_size"] = fc.bolt_size
        prop_d = s["prop_size_inch"] * 25.4
        s["prop_diameter_mm"] = prop_d
        min_adjacent_distance = prop_d + s["prop_clearance_mm"]
        s["wheelbase"] = min_adjacent_distance * math.sqrt(2) * 1.05
        s["arm_length"] = s["wheelbase"] / 2
        s["arm_root_width"] = motor.bell_diameter + 4
        s["arm_tip_width"] = motor.bell_diameter + 2
        if s["arm_thickness"] is None:
            material = s["frame_material"]
            if material == "carbon_fibre":
                s["arm_thickness"] = max(3.0, s["prop_size_inch"] * 0.8)
            elif material in ("3d_print_tpu", "3d_print_petg"):
                s["arm_thickness"] = max(5.0, s["prop_size_inch"] * 1.4)
        s["centre_plate_length"] = max(fc.board_length + 10, s["arm_root_width"] * 1.5)
        s["centre_plate_width"] = max(fc.board_width + 10, s["arm_root_width"] * 1.5)
        s["centre_plate_corner_r"] = 3.0
        s["standoff_positions"] = fc.bolt_hole_positions
        arm_offset = s["arm_length"]
        if s["config_type"] == "true_x":
            s["motor_positions"] = [(arm_offset * math.cos(math.radians(a)), arm_offset * math.sin(math.radians(a))) for a in [45, 135, 225, 315]]
        elif s["config_type"] == "stretch_x":
            stretch_offset = arm_offset * 1.2
            s["motor_positions"] = [(stretch_offset * math.cos(math.radians(a)), stretch_offset * math.sin(math.radians(a))) for a in [55, 125, 235, 305]]
        else:
            s["motor_positions"] = [(arm_offset * math.cos(math.radians(a)), arm_offset * math.sin(math.radians(a))) for a in [45, 135, 225, 315]]
        if s["frame_material"] == "carbon_fibre":
            cf_density = 1.55
            arm_vol_cm3 = (s["arm_length"] * s["arm_root_width"] * s["arm_thickness"]) / 1000
            plate_vol_cm3 = (s["centre_plate_length"] * s["centre_plate_width"] * s["top_plate_thickness"]) / 1000
            s["estimated_frame_weight_g"] = (4 * arm_vol_cm3 + 2 * plate_vol_cm3) * cf_density
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Drone")
        motor = MOTOR_PRESETS[s["motor_size"]]
        fc = FC_PRESETS[s["fc_stack_size"]]
        bolt_d = 3.2 if motor.bolt_size == "M3" else 2.2
        top = _build_centre_plate(s["centre_plate_length"], s["centre_plate_width"], s["top_plate_thickness"], s["centre_plate_corner_r"], stack_holes=fc.bolt_hole_positions, stack_bolt_d=bolt_d, standoff_holes=s["standoff_positions"], standoff_bolt_d=bolt_d)
        assy.add(top, loc=cq.Location(cq.Vector(0, 0, s["standoff_height"])), color=cq.Color(0.15, 0.15, 0.15), name="TopPlate")
        bottom = _build_centre_plate(s["centre_plate_length"], s["centre_plate_width"], s["bottom_plate_thickness"], s["centre_plate_corner_r"], stack_holes=fc.bolt_hole_positions, stack_bolt_d=bolt_d, standoff_holes=s["standoff_positions"], standoff_bolt_d=bolt_d)
        assy.add(bottom, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.15, 0.15, 0.15), name="BottomPlate")
        for i, (sx, sy) in enumerate(s["standoff_positions"]):
            standoff = _build_standoff(s["standoff_height"])
            assy.add(standoff, loc=cq.Location(cq.Vector(sx, sy, s["bottom_plate_thickness"])), color=cq.Color(0.7, 0.7, 0.7), name=f"Standoff_{i+1}")
        for i, (mx, my) in enumerate(s["motor_positions"]):
            arm_angle = math.degrees(math.atan2(my, mx))
            arm_len = math.sqrt(mx**2 + my**2)
            arm = _build_arm(arm_len, s["arm_root_width"], s["arm_tip_width"], s["arm_thickness"], motor.bolt_pattern, bolt_d)
            arm_loc = cq.Location(cq.Vector(0, 0, s["standoff_height"]/2)) * cq.Location(cq.Vector(0,0,0), cq.Vector(0,0,1), arm_angle)
            assy.add(arm, loc=arm_loc, color=cq.Color(0.12, 0.12, 0.12), name=f"Arm_{i+1}")
        for i, (mx, my) in enumerate(s["motor_positions"]):
            motor_proxy = _build_motor_proxy(motor)
            motor_z = s["standoff_height"] + s["top_plate_thickness"]
            assy.add(motor_proxy, loc=cq.Location(cq.Vector(mx, my, motor_z)), color=cq.Color(0.3, 0.3, 0.3), name=f"Motor_{i+1}")
        for i, (mx, my) in enumerate(s["motor_positions"]):
            disc = _build_prop_disc(s["prop_diameter_mm"])
            disc_z = s["standoff_height"] + s["top_plate_thickness"] + motor.height + 2
            assy.add(disc, loc=cq.Location(cq.Vector(mx, my, disc_z)), color=cq.Color(0.8, 0.2, 0.2, 0.2), name=f"PropDisc_{i+1}")
        return assy
$PYDRONE$,

  -- Same core library (shared across all grammars)
  $PYCORE2$
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
$PYCORE2$,

  -- Param specs
  '[
    {"name":"prop_size_inch","type":"float","unit":"inch","description":"Propeller diameter","default":5.0,"min_val":2.0,"max_val":10.0},
    {"name":"motor_size","type":"enum","unit":null,"description":"Motor stator size","default":"2306","enum_options":["1404","2004","2207","2306","2806"]},
    {"name":"fc_stack_size","type":"enum","unit":null,"description":"Flight controller stack mounting pattern","default":"30.5mm","enum_options":["20mm","25.5mm","30.5mm"]},
    {"name":"frame_material","type":"enum","unit":null,"description":"Frame material","default":"carbon_fibre","enum_options":["carbon_fibre","3d_print_tpu","3d_print_petg"]},
    {"name":"arm_thickness","type":"float","unit":"mm","description":"Arm plate thickness (auto-derived if null)","default":null,"min_val":3.0,"max_val":8.0},
    {"name":"top_plate_thickness","type":"float","unit":"mm","description":"Top plate thickness","default":2.0,"min_val":1.5,"max_val":4.0},
    {"name":"bottom_plate_thickness","type":"float","unit":"mm","description":"Bottom plate thickness","default":2.0,"min_val":1.5,"max_val":4.0},
    {"name":"standoff_height","type":"float","unit":"mm","description":"Standoff height between plates","default":25.0,"min_val":15.0,"max_val":40.0},
    {"name":"camera_tilt_deg","type":"float","unit":"degrees","description":"FPV camera tilt angle","default":25.0,"min_val":0.0,"max_val":45.0},
    {"name":"prop_clearance_mm","type":"float","unit":"mm","description":"Minimum clearance between prop tips","default":8.0,"min_val":3.0,"max_val":20.0},
    {"name":"config_type","type":"enum","unit":null,"description":"Arm configuration","default":"true_x","enum_options":["true_x","stretch_x","squished_x","deadcat"]}
  ]'::jsonb,

  '{"prop_size_inch":5.0,"motor_size":"2306","fc_stack_size":"30.5mm","frame_material":"carbon_fibre","arm_thickness":null,"top_plate_thickness":2.0,"bottom_plate_thickness":2.0,"standoff_height":25.0,"camera_tilt_deg":25.0,"prop_clearance_mm":8.0,"config_type":"true_x"}'::jsonb,

  'Prop clearance (no overlap). Motor bell fits arm tip. FC stack fits centre plate.',
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
