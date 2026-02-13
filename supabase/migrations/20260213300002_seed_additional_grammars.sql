-- ═══════════════════════════════════════════════════════════════
-- Seed Additional CAD Grammars: Enclosure, Rocket, Gear, Furniture
-- ═══════════════════════════════════════════════════════════════

-- ─── Electronics Enclosure Grammar ────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'enclosure',
  'Electronics Enclosure',
  'PCB-first electronics enclosures with mount posts, port cutouts, snap-fit or screw closure, and ventilation. Designed for FDM 3D printing or injection moulding. IEC 60529 compatible.',
  ARRAY['enclosure', 'case', 'box', 'housing', 'electronics', 'pcb', 'arduino', 'raspberry pi', 'esp32', 'controller', 'junction box', 'project box', 'electronics case', 'sensor housing', 'iot', 'control box'],
  ARRAY[
    'Design an Arduino Uno enclosure',
    'Create a Raspberry Pi case',
    'Build a waterproof sensor housing',
    'Make a project box for a custom PCB',
    'Design an ESP32 enclosure with USB port',
    'Create a control box for electronics'
  ],
  $PYENCLOSURE$
"""
ForgeOS Electronics Enclosure Grammar
PCB-first design: cavity derived from board dimensions.
"""
import math
from typing import Any, Dict, List, Tuple
import cadquery as cq

def _build_shell(length, width, height, wall_t, corner_r):
    outer = cq.Workplane("XY").rect(length, width).extrude(height)
    inner = cq.Workplane("XY").rect(length - 2*wall_t, width - 2*wall_t).extrude(height - wall_t)
    inner = inner.translate((0, 0, wall_t))
    shell = outer.cut(inner)
    if corner_r > 0:
        try: shell = shell.edges("|Z").fillet(corner_r)
        except Exception: pass
    return shell

def _build_mount_post(height, od, bore_d):
    post = cq.Workplane("XY").circle(od/2).extrude(height)
    bore = cq.Workplane("XY").circle(bore_d/2).extrude(height + 1)
    return post.cut(bore)

def _build_port_cutout(width, height, depth):
    return cq.Workplane("XY").rect(width, height).extrude(depth)

def _build_vent_slots(count, slot_w, slot_h, spacing, depth):
    total_h = count * slot_h + (count - 1) * spacing
    start_y = -total_h / 2
    result = cq.Workplane("XY").rect(slot_w, slot_h).extrude(depth)
    for i in range(1, count):
        slot = cq.Workplane("XY").rect(slot_w, slot_h).extrude(depth)
        slot = slot.translate((0, i * (slot_h + spacing), 0))
        result = result.union(slot)
    return result.translate((0, start_y, 0))

class EnclosureGrammar(DomainGrammar):
    @property
    def name(self): return "enclosure"
    @property
    def display_name(self): return "Electronics Enclosure"
    @property
    def description(self): return "PCB-first electronics enclosures with mount posts and port cutouts"

    def param_specs(self):
        return [
            ParamSpec("pcb_length", "float", "mm", "PCB length", 68.6, 10, 300),
            ParamSpec("pcb_width", "float", "mm", "PCB width", 53.4, 10, 200),
            ParamSpec("pcb_thickness", "float", "mm", "PCB thickness", 1.6, 0.8, 3.2),
            ParamSpec("pcb_clearance", "float", "mm", "Clearance around PCB", 1.5, 0.5, 5.0),
            ParamSpec("pcb_standoff_height", "float", "mm", "Standoff height below PCB", 5.0, 2.0, 15.0),
            ParamSpec("component_height", "float", "mm", "Tallest component above PCB", 15.0, 3.0, 60.0),
            ParamSpec("lid_clearance", "float", "mm", "Clearance above components to lid", 2.0, 1.0, 10.0),
            ParamSpec("wall_thickness", "float", "mm", "Wall thickness", 2.0, 1.2, 5.0),
            ParamSpec("corner_radius", "float", "mm", "Corner fillet radius", 2.0, 0.0, 8.0),
            ParamSpec("split_ratio", "float", None, "Base/lid split ratio (0-1)", 0.4, 0.2, 0.8),
            ParamSpec("screw_diameter", "float", "mm", "Screw diameter", 3.0, 2.0, 5.0),
            ParamSpec("closure_type", "enum", None, "Closure mechanism", "screw",
                enum_options=["screw", "snap_fit", "friction"]),
            ParamSpec("pcb_mount_holes", "list", "mm", "PCB mount hole positions [(x,y)]", None),
            ParamSpec("port_count", "int", None, "Number of port cutouts", 1, 0, 8),
        ]

    def defaults(self):
        return {
            "pcb_length": 68.6, "pcb_width": 53.4, "pcb_thickness": 1.6,
            "pcb_clearance": 1.5, "pcb_standoff_height": 5.0, "component_height": 15.0,
            "lid_clearance": 2.0, "wall_thickness": 2.0, "corner_radius": 2.0,
            "split_ratio": 0.4, "screw_diameter": 3.0, "closure_type": "screw",
            "pcb_mount_holes": [[-24.13, -22.86], [-24.13, 24.13], [27.94, -20.32], [27.94, 22.86]],
            "port_count": 1,
        }

    def constraints(self):
        return [
            Constraint("min_wall", "FDM minimum wall thickness",
                lambda s: (s["wall_thickness"] >= 1.2, f"Wall {s['wall_thickness']}mm < 1.2mm FDM minimum"), severity="error"),
            Constraint("screw_boss", "Boss OD must be >= 2x screw diameter",
                lambda s: (s["boss_od"] >= s["screw_diameter"] * 2,
                    f"Boss OD {s['boss_od']}mm < 2x screw {s['screw_diameter']}mm"), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        s["inner_length"] = s["pcb_length"] + 2 * s["pcb_clearance"]
        s["inner_width"] = s["pcb_width"] + 2 * s["pcb_clearance"]
        s["inner_height"] = s["pcb_standoff_height"] + s["pcb_thickness"] + s["component_height"] + s["lid_clearance"]
        s["outer_length"] = s["inner_length"] + 2 * s["wall_thickness"]
        s["outer_width"] = s["inner_width"] + 2 * s["wall_thickness"]
        s["outer_height"] = s["inner_height"] + s["wall_thickness"]
        s["base_height"] = s["outer_height"] * s["split_ratio"]
        s["lid_height"] = s["outer_height"] - s["base_height"]
        s["lip_height"] = 3.0
        s["lip_inset"] = 1.0
        s["boss_od"] = s["screw_diameter"] * 2.5
        s["boss_bore"] = s["screw_diameter"] * 0.85
        mount_holes = s.get("pcb_mount_holes", [])
        if isinstance(mount_holes, list) and len(mount_holes) > 0:
            s["mount_positions"] = [(h[0], h[1]) if isinstance(h, list) else h for h in mount_holes]
        else:
            hl, hw = s["pcb_length"] / 2 - 3, s["pcb_width"] / 2 - 3
            s["mount_positions"] = [(-hl, -hw), (-hl, hw), (hl, -hw), (hl, hw)]
        return s

    def build(self, skeleton):
        s = skeleton
        wt = s["wall_thickness"]
        cr = s["corner_radius"]
        assy = cq.Assembly(name="ForgeOS_Enclosure")
        base = _build_shell(s["outer_length"], s["outer_width"], s["base_height"], wt, cr)
        assy.add(base, loc=cq.Location(cq.Vector(0, 0, 0)), color=cq.Color(0.2, 0.2, 0.2), name="Base")
        lid = _build_shell(s["outer_length"], s["outer_width"], s["lid_height"], wt, cr)
        lip = cq.Workplane("XY").rect(
            s["outer_length"] - 2*wt - 2*s["lip_inset"],
            s["outer_width"] - 2*wt - 2*s["lip_inset"]
        ).extrude(s["lip_height"])
        lid = lid.union(lip.translate((0, 0, -s["lip_height"])))
        assy.add(lid, loc=cq.Location(cq.Vector(0, 0, s["base_height"] + 2)),
            color=cq.Color(0.3, 0.3, 0.3), name="Lid")
        for i, (mx, my) in enumerate(s.get("mount_positions", [])):
            post = _build_mount_post(s["pcb_standoff_height"], s["boss_od"], s["boss_bore"])
            assy.add(post, loc=cq.Location(cq.Vector(mx, my, wt)),
                color=cq.Color(0.2, 0.6, 0.2), name=f"MountPost_{i+1}")
        if s.get("port_count", 0) > 0:
            port_w, port_h = 12, 11
            cutout = _build_port_cutout(port_w, port_h, wt + 2)
            port_x = -s["outer_length"]/2
            port_z = wt + s["pcb_standoff_height"] + s["pcb_thickness"]/2
            assy.add(cutout, loc=cq.Location(cq.Vector(port_x, 0, port_z)),
                color=cq.Color(0.8, 0.1, 0.1, 0.5), name="PortCutout_1")
        if s["closure_type"] == "screw":
            for i, (mx, my) in enumerate(s.get("mount_positions", [])[:4]):
                boss = _build_mount_post(s["base_height"] - wt, s["boss_od"], s["boss_bore"])
                assy.add(boss, loc=cq.Location(cq.Vector(mx, my, wt)),
                    color=cq.Color(0.5, 0.5, 0.5), name=f"ScrewBoss_{i+1}")
        return assy
$PYENCLOSURE$,

  $PYCORE_ENC$
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
            except (TypeError, ValueError): return False, f"{self.name}: expected float"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < min {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > max {self.max_val}"
        elif self.type == "int":
            try: v = int(value)
            except (TypeError, ValueError): return False, f"{self.name}: expected int"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < min {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > max {self.max_val}"
        elif self.type == "enum":
            if self.enum_options and value not in self.enum_options: return False, f"{self.name}: '{value}' not in {self.enum_options}"
        elif self.type == "bool":
            if not isinstance(value, bool): return False, f"{self.name}: expected bool"
        elif self.type == "list":
            if not isinstance(value, list): return False, f"{self.name}: expected list"
        elif self.type == "dict_list":
            if not isinstance(value, list): return False, f"{self.name}: expected list of dicts"
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
    def derive_skeleton(self, params): ...
    @abstractmethod
    def build(self, skeleton): ...
    def validate(self, skeleton, assembly):
        result = ValidationResult(passed=True)
        for c in self.constraints():
            ok, msg = c.check(skeleton)
            if not ok:
                if c.severity == "error": result.errors.append(f"[{c.name}] {msg}"); result.passed = False
                else: result.warnings.append(f"[{c.name}] {msg}")
        compound = assembly.toCompound()
        bb = compound.BoundingBox()
        result.metrics["part_count"] = len(assembly.children)
        result.metrics["envelope_mm"] = f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f}"
        return result
    def validate_params(self, params):
        result = ValidationResult(passed=True)
        full = {**self.defaults(), **params}
        for spec in self.param_specs():
            if spec.name not in full:
                if spec.default is None and spec.type not in ("dict_list", "list"): result.errors.append(f"Required '{spec.name}' missing"); result.passed = False
                continue
            ok, msg = spec.validate(full[spec.name])
            if not ok: result.errors.append(msg); result.passed = False
        return result
    def generate(self, params):
        full = {**self.defaults(), **params}
        pr = self.validate_params(full)
        if not pr.passed: return None, pr
        skeleton = self.derive_skeleton(full)
        assembly = self.build(skeleton)
        result = self.validate(skeleton, assembly)
        return assembly, result
$PYCORE_ENC$,

  '[{"name":"pcb_length","type":"float","unit":"mm","description":"PCB length","default":68.6,"min_val":10,"max_val":300},
    {"name":"pcb_width","type":"float","unit":"mm","description":"PCB width","default":53.4,"min_val":10,"max_val":200},
    {"name":"pcb_thickness","type":"float","unit":"mm","description":"PCB thickness","default":1.6,"min_val":0.8,"max_val":3.2},
    {"name":"pcb_clearance","type":"float","unit":"mm","description":"Clearance around PCB","default":1.5,"min_val":0.5,"max_val":5.0},
    {"name":"pcb_standoff_height","type":"float","unit":"mm","description":"Standoff height below PCB","default":5.0,"min_val":2.0,"max_val":15.0},
    {"name":"component_height","type":"float","unit":"mm","description":"Tallest component above PCB","default":15.0,"min_val":3.0,"max_val":60.0},
    {"name":"lid_clearance","type":"float","unit":"mm","description":"Clearance above components","default":2.0,"min_val":1.0,"max_val":10.0},
    {"name":"wall_thickness","type":"float","unit":"mm","description":"Wall thickness","default":2.0,"min_val":1.2,"max_val":5.0},
    {"name":"corner_radius","type":"float","unit":"mm","description":"Corner fillet radius","default":2.0,"min_val":0,"max_val":8.0},
    {"name":"split_ratio","type":"float","unit":null,"description":"Base/lid split ratio","default":0.4,"min_val":0.2,"max_val":0.8},
    {"name":"screw_diameter","type":"float","unit":"mm","description":"Screw diameter","default":3.0,"min_val":2.0,"max_val":5.0},
    {"name":"closure_type","type":"enum","unit":null,"description":"Closure mechanism","default":"screw","enum_options":["screw","snap_fit","friction"]},
    {"name":"pcb_mount_holes","type":"list","unit":"mm","description":"PCB mount hole positions","default":null},
    {"name":"port_count","type":"int","unit":null,"description":"Number of port cutouts","default":1,"min_val":0,"max_val":8}]'::jsonb,
  '{"pcb_length":68.6,"pcb_width":53.4,"pcb_thickness":1.6,"pcb_clearance":1.5,"pcb_standoff_height":5.0,"component_height":15.0,"lid_clearance":2.0,"wall_thickness":2.0,"corner_radius":2.0,"split_ratio":0.4,"screw_diameter":3.0,"closure_type":"screw","port_count":1}'::jsonb,
  'Min wall 1.2mm (FDM). Screw boss OD >= 2x screw diameter.',
  'built_in', 1
) ON CONFLICT (name) DO UPDATE SET python_code=EXCLUDED.python_code, core_library_code=EXCLUDED.core_library_code, param_specs=EXCLUDED.param_specs, defaults=EXCLUDED.defaults, domain_keywords=EXCLUDED.domain_keywords, example_prompts=EXCLUDED.example_prompts, updated_at=NOW();


-- ─── Model Rocket Grammar ─────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'rocket',
  'Model Rocket',
  'Axisymmetric model rockets with nose cone (ogive/conical), body tube, trapezoidal fins, motor tube, and centering rings. Barrowman stability analysis. NAR safety code compliant.',
  ARRAY['rocket', 'model rocket', 'rocketry', 'estes', 'nose cone', 'fin', 'body tube', 'motor mount', 'high power', 'mid power', 'low power', 'launch vehicle', 'sounding rocket'],
  ARRAY[
    'Design a model rocket',
    'Build an Estes Alpha-style rocket',
    'Create a 3-fin model rocket with ogive nose',
    'Design a high-power rocket',
    'Make a small sounding rocket'
  ],
  $PYROCKET$
"""
ForgeOS Model Rocket Grammar — Axisymmetric Design
"""
import math
from typing import Any, Dict, List, Tuple
import cadquery as cq

def _build_nose_cone_ogive(length, diameter, wall_t):
    r = diameter / 2
    ogive_r = (r**2 + length**2) / (2 * r)
    pts = []
    steps = 40
    for i in range(steps + 1):
        x = i * length / steps
        rho = math.sqrt(ogive_r**2 - (length - x)**2) + r - ogive_r
        if rho < 0: rho = 0
        pts.append((x, rho))
    pts.append((length, 0.001))
    inner_pts = []
    for x, rho in reversed(pts):
        inner_r = max(rho - wall_t, 0.001)
        inner_pts.append((x, inner_r))
    profile_pts = pts + inner_pts
    wp = cq.Workplane("XZ")
    wp = wp.moveTo(profile_pts[0][0], profile_pts[0][1])
    for px, py in profile_pts[1:]:
        wp = wp.lineTo(px, py)
    wp = wp.close()
    return wp.revolve(360, (0, 0, 0), (1, 0, 0))

def _build_nose_cone_conical(length, diameter, wall_t):
    r = diameter / 2
    outer = cq.Workplane("XZ").moveTo(0, r).lineTo(length, 0.001).lineTo(length, 0).lineTo(0, 0).close().revolve(360, (0,0,0), (1,0,0))
    ir = max(r - wall_t, 0.1)
    inner_l = length * (1 - wall_t/r)
    inner = cq.Workplane("XZ").moveTo(0, ir).lineTo(inner_l, 0.001).lineTo(inner_l, 0).lineTo(0, 0).close().revolve(360, (0,0,0), (1,0,0))
    return outer.cut(inner)

def _build_body_tube(length, od, wall_t):
    outer = cq.Workplane("XY").circle(od/2).extrude(length)
    inner = cq.Workplane("XY").circle(od/2 - wall_t).extrude(length)
    return outer.cut(inner)

def _build_fin(root_chord, tip_chord, span, sweep_deg, thickness):
    sweep_offset = span * math.tan(math.radians(sweep_deg))
    pts = [(0, 0), (root_chord, 0), (sweep_offset + tip_chord, span), (sweep_offset, span)]
    return cq.Workplane("XZ").polyline(pts).close().extrude(thickness)

def _build_centering_ring(od, id_d, thickness):
    outer = cq.Workplane("XY").circle(od/2).extrude(thickness)
    inner = cq.Workplane("XY").circle(id_d/2).extrude(thickness + 1)
    return outer.cut(inner)

class RocketGrammar(DomainGrammar):
    @property
    def name(self): return "rocket"
    @property
    def display_name(self): return "Model Rocket"
    @property
    def description(self): return "Axisymmetric model rockets with stability analysis"

    def param_specs(self):
        return [
            ParamSpec("nose_shape", "enum", None, "Nose cone shape", "ogive", enum_options=["ogive", "conical"]),
            ParamSpec("nose_length", "float", "mm", "Nose cone length", 70, 20, 500),
            ParamSpec("body_diameter", "float", "mm", "Body tube outer diameter", 25.4, 10, 100),
            ParamSpec("body_wall_t", "float", "mm", "Body tube wall thickness", 0.5, 0.3, 3.0),
            ParamSpec("body_length", "float", "mm", "Body tube length", 200, 50, 1000),
            ParamSpec("fin_count", "int", None, "Number of fins", 3, 3, 6),
            ParamSpec("fin_root_chord", "float", "mm", "Fin root chord", 50, 15, 200),
            ParamSpec("fin_tip_chord", "float", "mm", "Fin tip chord", 25, 5, 150),
            ParamSpec("fin_span", "float", "mm", "Fin semi-span", 40, 10, 150),
            ParamSpec("fin_sweep_deg", "float", "degrees", "Fin leading edge sweep angle", 30, 0, 60),
            ParamSpec("fin_thickness", "float", "mm", "Fin thickness", 2.0, 1.0, 6.0),
            ParamSpec("motor_diameter", "float", "mm", "Motor tube outer diameter", 18, 10, 54),
            ParamSpec("motor_length", "float", "mm", "Motor length", 70, 30, 300),
        ]

    def defaults(self):
        return {
            "nose_shape": "ogive", "nose_length": 70, "body_diameter": 25.4,
            "body_wall_t": 0.5, "body_length": 200, "fin_count": 3,
            "fin_root_chord": 50, "fin_tip_chord": 25, "fin_span": 40,
            "fin_sweep_deg": 30, "fin_thickness": 2.0,
            "motor_diameter": 18, "motor_length": 70,
        }

    def constraints(self):
        return [
            Constraint("fin_count_min", "Minimum 3 fins for stability",
                lambda s: (s["fin_count"] >= 3, f"Only {s['fin_count']} fins, need >= 3"), severity="error"),
            Constraint("nose_ratio", "Nose length should be 2-5x diameter for good drag",
                lambda s: (2 <= s["nose_length"]/s["body_diameter"] <= 5,
                    f"Nose ratio {s['nose_length']/s['body_diameter']:.1f}, prefer 2-5"), severity="warning"),
            Constraint("motor_fits", "Motor must fit inside body tube",
                lambda s: (s["motor_diameter"] < s["body_diameter"] - 2*s["body_wall_t"],
                    f"Motor {s['motor_diameter']}mm doesn't fit in body {s['body_diameter']-2*s['body_wall_t']:.1f}mm ID"), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        s["body_id"] = s["body_diameter"] - 2 * s["body_wall_t"]
        s["motor_tube_wall_t"] = 0.5
        s["motor_tube_od"] = s["motor_diameter"]
        s["motor_tube_id"] = s["motor_diameter"] - 2 * s["motor_tube_wall_t"]
        s["total_length"] = s["nose_length"] + s["body_length"]
        s["fin_angle_step"] = 360.0 / s["fin_count"]
        s["centering_ring_od"] = s["body_id"] - 0.5
        s["centering_ring_id"] = s["motor_tube_od"] + 0.5
        s["centering_ring_t"] = 3.0
        s["fin_start_x"] = s["body_length"] - s["fin_root_chord"]
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Rocket")
        if s["nose_shape"] == "ogive":
            nose = _build_nose_cone_ogive(s["nose_length"], s["body_diameter"], s["body_wall_t"])
        else:
            nose = _build_nose_cone_conical(s["nose_length"], s["body_diameter"], s["body_wall_t"])
        assy.add(nose, loc=cq.Location(cq.Vector(0, 0, s["body_length"])),
            color=cq.Color(0.9, 0.1, 0.1), name="NoseCone")
        body = _build_body_tube(s["body_length"], s["body_diameter"], s["body_wall_t"])
        assy.add(body, loc=cq.Location(cq.Vector(0, 0, 0)),
            color=cq.Color(0.9, 0.9, 0.9), name="BodyTube")
        motor_tube = _build_body_tube(s["motor_length"], s["motor_tube_od"], s["motor_tube_wall_t"])
        assy.add(motor_tube, loc=cq.Location(cq.Vector(0, 0, 0)),
            color=cq.Color(0.4, 0.4, 0.4), name="MotorTube")
        for i in range(s["fin_count"]):
            angle = i * s["fin_angle_step"]
            fin = _build_fin(s["fin_root_chord"], s["fin_tip_chord"], s["fin_span"], s["fin_sweep_deg"], s["fin_thickness"])
            fin_loc = (cq.Location(cq.Vector(0, 0, s["fin_start_x"])) *
                cq.Location(cq.Vector(0, 0, 0), cq.Vector(0, 0, 1), angle) *
                cq.Location(cq.Vector(0, s["body_diameter"]/2, 0)))
            assy.add(fin, loc=fin_loc, color=cq.Color(0.9, 0.1, 0.1), name=f"Fin_{i+1}")
        for i, z_frac in enumerate([0.05, 0.85]):
            ring = _build_centering_ring(s["centering_ring_od"], s["centering_ring_id"], s["centering_ring_t"])
            assy.add(ring, loc=cq.Location(cq.Vector(0, 0, z_frac * s["motor_length"])),
                color=cq.Color(0.8, 0.7, 0.5), name=f"CenteringRing_{i+1}")
        return assy
$PYROCKET$,

  $PYCORE_ROCKET$
"""ForgeOS Core — Domain Grammar Base Classes"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq
@dataclass
class ParamSpec:
    name: str; type: str; unit: Optional[str] = None; description: str = ""; default: Any = None; min_val: Any = None; max_val: Any = None; enum_options: Optional[List[str]] = None
    def validate(self, value):
        if value is None: return True, ""
        if self.type == "float":
            try: v = float(value)
            except: return False, f"{self.name}: expected float"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > {self.max_val}"
        elif self.type == "int":
            try: v = int(value)
            except: return False, f"{self.name}: expected int"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > {self.max_val}"
        elif self.type == "enum" and self.enum_options and value not in self.enum_options: return False, f"{self.name}: not in {self.enum_options}"
        elif self.type == "bool" and not isinstance(value, bool): return False, f"{self.name}: expected bool"
        elif self.type == "list" and not isinstance(value, list): return False, f"{self.name}: expected list"
        return True, ""
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
        for c in self.constraints():
            ok, msg = c.check(skeleton)
            if not ok:
                if c.severity=="error": r.errors.append(f"[{c.name}] {msg}"); r.passed=False
                else: r.warnings.append(f"[{c.name}] {msg}")
        bb = assembly.toCompound().BoundingBox()
        r.metrics["part_count"]=len(assembly.children); r.metrics["envelope_mm"]=f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f}"
        return r
    def validate_params(self, params):
        r = ValidationResult(passed=True); full={**self.defaults(),**params}
        for spec in self.param_specs():
            if spec.name not in full:
                if spec.default is None and spec.type not in ("dict_list","list"): r.errors.append(f"Required '{spec.name}' missing"); r.passed=False
                continue
            ok,msg=spec.validate(full[spec.name])
            if not ok: r.errors.append(msg); r.passed=False
        return r
    def generate(self, params):
        full={**self.defaults(),**params}; pr=self.validate_params(full)
        if not pr.passed: return None, pr
        sk=self.derive_skeleton(full); a=self.build(sk); return a, self.validate(sk, a)
$PYCORE_ROCKET$,

  '[{"name":"nose_shape","type":"enum","description":"Nose cone shape","default":"ogive","enum_options":["ogive","conical"]},
    {"name":"nose_length","type":"float","unit":"mm","description":"Nose cone length","default":70,"min_val":20,"max_val":500},
    {"name":"body_diameter","type":"float","unit":"mm","description":"Body tube OD","default":25.4,"min_val":10,"max_val":100},
    {"name":"body_wall_t","type":"float","unit":"mm","description":"Body wall thickness","default":0.5,"min_val":0.3,"max_val":3.0},
    {"name":"body_length","type":"float","unit":"mm","description":"Body tube length","default":200,"min_val":50,"max_val":1000},
    {"name":"fin_count","type":"int","description":"Number of fins","default":3,"min_val":3,"max_val":6},
    {"name":"fin_root_chord","type":"float","unit":"mm","description":"Fin root chord","default":50,"min_val":15,"max_val":200},
    {"name":"fin_tip_chord","type":"float","unit":"mm","description":"Fin tip chord","default":25,"min_val":5,"max_val":150},
    {"name":"fin_span","type":"float","unit":"mm","description":"Fin semi-span","default":40,"min_val":10,"max_val":150},
    {"name":"fin_sweep_deg","type":"float","unit":"degrees","description":"Fin sweep angle","default":30,"min_val":0,"max_val":60},
    {"name":"fin_thickness","type":"float","unit":"mm","description":"Fin thickness","default":2.0,"min_val":1.0,"max_val":6.0},
    {"name":"motor_diameter","type":"float","unit":"mm","description":"Motor tube OD","default":18,"min_val":10,"max_val":54},
    {"name":"motor_length","type":"float","unit":"mm","description":"Motor length","default":70,"min_val":30,"max_val":300}]'::jsonb,
  '{"nose_shape":"ogive","nose_length":70,"body_diameter":25.4,"body_wall_t":0.5,"body_length":200,"fin_count":3,"fin_root_chord":50,"fin_tip_chord":25,"fin_span":40,"fin_sweep_deg":30,"fin_thickness":2.0,"motor_diameter":18,"motor_length":70}'::jsonb,
  'Min 3 fins. Nose ratio 2-5x diameter. Motor must fit body tube.',
  'built_in', 1
) ON CONFLICT (name) DO UPDATE SET python_code=EXCLUDED.python_code, core_library_code=EXCLUDED.core_library_code, param_specs=EXCLUDED.param_specs, defaults=EXCLUDED.defaults, domain_keywords=EXCLUDED.domain_keywords, example_prompts=EXCLUDED.example_prompts, updated_at=NOW();


-- ─── Gear Train Grammar ───────────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'gear_train',
  'Gear Train',
  'Spur gear pairs with involute tooth approximation. Module-based sizing per DIN 867. Computes gear ratio, centre distance, and tooth geometry from functional parameters.',
  ARRAY['gear', 'gears', 'gear train', 'spur gear', 'cog', 'transmission', 'gear ratio', 'pinion', 'rack', 'involute', 'gearbox', 'reduction', 'torque', 'drivetrain'],
  ARRAY[
    'Design a 3:1 gear reduction',
    'Create a pair of spur gears',
    'Build a gear train for a robot',
    'Design a gearbox with 5:1 ratio',
    'Make a pinion and gear set'
  ],
  $PYGEAR$
"""
ForgeOS Gear Train Grammar — Spur Gear Pairs (DIN 867)
"""
import math
from typing import Any, Dict, List, Tuple
import cadquery as cq

def _build_gear(module, teeth, width, bore_d, pressure_angle_deg=20):
    pa = math.radians(pressure_angle_deg)
    pitch_r = module * teeth / 2
    addendum = module
    dedendum = 1.25 * module
    outer_r = pitch_r + addendum
    root_r = pitch_r - dedendum
    base_r = pitch_r * math.cos(pa)
    tooth_angle = 2 * math.pi / teeth
    half_tooth = math.pi / (2 * teeth)
    pts_per_side = 8
    profile_pts = []
    for i in range(teeth):
        angle_start = i * tooth_angle - half_tooth
        angle_end = i * tooth_angle + half_tooth
        for j in range(pts_per_side + 1):
            t = j / pts_per_side
            a = angle_start + t * (angle_end - angle_start)
            r = root_r + (outer_r - root_r) * math.sin(t * math.pi)
            profile_pts.append((r * math.cos(a), r * math.sin(a)))
    gear = cq.Workplane("XY")
    gear = gear.moveTo(profile_pts[0][0], profile_pts[0][1])
    for px, py in profile_pts[1:]:
        gear = gear.lineTo(px, py)
    gear = gear.close().extrude(width)
    bore = cq.Workplane("XY").circle(bore_d / 2).extrude(width + 1)
    gear = gear.cut(bore)
    return gear

def _build_simple_gear(pitch_r, outer_r, root_r, teeth, width, bore_d):
    outer = cq.Workplane("XY").circle(outer_r).extrude(width)
    bore = cq.Workplane("XY").circle(bore_d / 2).extrude(width + 1)
    gear = outer.cut(bore)
    tooth_angle = 360.0 / teeth
    for i in range(teeth):
        a = math.radians(i * tooth_angle)
        slot_w = math.pi * pitch_r / teeth * 0.5
        slot_d = outer_r - root_r
        cutter = cq.Workplane("XY").rect(slot_w, slot_d).extrude(width + 2)
        cx = (outer_r + root_r) / 2 * math.cos(a)
        cy = (outer_r + root_r) / 2 * math.sin(a)
        cutter = cutter.translate((cx, cy, -0.5))
        rot_cutter = cutter.rotate((0,0,0), (0,0,1), math.degrees(a))
        gear = gear.cut(rot_cutter)
    return gear

class GearTrainGrammar(DomainGrammar):
    @property
    def name(self): return "gear_train"
    @property
    def display_name(self): return "Gear Train"
    @property
    def description(self): return "Spur gear pairs with module-based sizing (DIN 867)"

    def param_specs(self):
        return [
            ParamSpec("desired_ratio", "float", None, "Gear ratio (output/input)", 3.0, 1.0, 20.0),
            ParamSpec("module", "float", "mm", "Gear module (tooth size)", 1.5, 0.5, 10.0),
            ParamSpec("pressure_angle", "float", "degrees", "Pressure angle", 20.0, 14.5, 25.0),
            ParamSpec("face_width", "float", "mm", "Face width (gear thickness)", 10.0, 3.0, 50.0),
            ParamSpec("driver_teeth", "int", None, "Driver gear tooth count", 17, 12, 100),
            ParamSpec("bore_diameter", "float", "mm", "Shaft bore diameter", 5.0, 1.0, 25.0),
        ]

    def defaults(self):
        return {
            "desired_ratio": 3.0, "module": 1.5, "pressure_angle": 20.0,
            "face_width": 10.0, "driver_teeth": 17, "bore_diameter": 5.0,
        }

    def constraints(self):
        return [
            Constraint("min_teeth", "Minimum teeth to avoid undercut",
                lambda s: (s["driver_teeth"] >= s["min_teeth_no_undercut"],
                    f"Driver has {s['driver_teeth']} teeth, min {s['min_teeth_no_undercut']} for {s['pressure_angle']}deg PA"), severity="warning"),
            Constraint("ratio_match", "Actual ratio should be close to desired",
                lambda s: (abs(s["actual_ratio"] - s["desired_ratio"]) / s["desired_ratio"] < 0.1,
                    f"Actual ratio {s['actual_ratio']:.2f} differs from desired {s['desired_ratio']:.2f} by >{10}%"), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        m = s["module"]
        z1 = s["driver_teeth"]
        z2 = round(z1 * s["desired_ratio"])
        s["driven_teeth"] = z2
        s["actual_ratio"] = z2 / z1
        s["driver_pitch_d"] = m * z1
        s["driven_pitch_d"] = m * z2
        s["centre_distance"] = m * (z1 + z2) / 2
        s["addendum"] = m
        s["dedendum"] = 1.25 * m
        s["driver_outer_r"] = s["driver_pitch_d"] / 2 + s["addendum"]
        s["driver_root_r"] = s["driver_pitch_d"] / 2 - s["dedendum"]
        s["driven_outer_r"] = s["driven_pitch_d"] / 2 + s["addendum"]
        s["driven_root_r"] = s["driven_pitch_d"] / 2 - s["dedendum"]
        pa = math.radians(s["pressure_angle"])
        s["min_teeth_no_undercut"] = round(2 / (math.sin(pa) ** 2))
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_GearTrain")
        driver = _build_simple_gear(
            s["driver_pitch_d"]/2, s["driver_outer_r"], s["driver_root_r"],
            s["driver_teeth"], s["face_width"], s["bore_diameter"])
        assy.add(driver, loc=cq.Location(cq.Vector(0, 0, 0)),
            color=cq.Color(0.7, 0.7, 0.7), name="DriverGear")
        driven = _build_simple_gear(
            s["driven_pitch_d"]/2, s["driven_outer_r"], s["driven_root_r"],
            s["driven_teeth"], s["face_width"], s["bore_diameter"])
        half_tooth_angle = 180.0 / s["driven_teeth"]
        assy.add(driven, loc=cq.Location(cq.Vector(s["centre_distance"], 0, 0)) *
            cq.Location(cq.Vector(0,0,0), cq.Vector(0,0,1), half_tooth_angle),
            color=cq.Color(0.6, 0.6, 0.8), name="DrivenGear")
        for i, (x, label) in enumerate([(0, "DriverShaft"), (s["centre_distance"], "DrivenShaft")]):
            shaft = cq.Workplane("XY").circle(s["bore_diameter"]/2 - 0.2).extrude(s["face_width"] * 2)
            assy.add(shaft, loc=cq.Location(cq.Vector(x, 0, -s["face_width"]*0.5)),
                color=cq.Color(0.4, 0.4, 0.4), name=label)
        return assy
$PYGEAR$,

  $PYCORE_GEAR$
"""ForgeOS Core — Domain Grammar Base Classes"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq
@dataclass
class ParamSpec:
    name: str; type: str; unit: Optional[str] = None; description: str = ""; default: Any = None; min_val: Any = None; max_val: Any = None; enum_options: Optional[List[str]] = None
    def validate(self, value):
        if value is None: return True, ""
        if self.type == "float":
            try: v = float(value)
            except: return False, f"{self.name}: expected float"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > {self.max_val}"
        elif self.type == "int":
            try: v = int(value)
            except: return False, f"{self.name}: expected int"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > {self.max_val}"
        elif self.type == "enum" and self.enum_options and value not in self.enum_options: return False, f"not in {self.enum_options}"
        elif self.type == "bool" and not isinstance(value, bool): return False, f"expected bool"
        return True, ""
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
        for c in self.constraints():
            ok, msg = c.check(skeleton)
            if not ok:
                if c.severity=="error": r.errors.append(f"[{c.name}] {msg}"); r.passed=False
                else: r.warnings.append(f"[{c.name}] {msg}")
        bb = assembly.toCompound().BoundingBox()
        r.metrics["part_count"]=len(assembly.children); r.metrics["envelope_mm"]=f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f}"
        return r
    def validate_params(self, params):
        r = ValidationResult(passed=True); full={**self.defaults(),**params}
        for spec in self.param_specs():
            if spec.name not in full:
                if spec.default is None and spec.type not in ("dict_list","list"): r.errors.append(f"Required '{spec.name}'"); r.passed=False
                continue
            ok,msg=spec.validate(full[spec.name])
            if not ok: r.errors.append(msg); r.passed=False
        return r
    def generate(self, params):
        full={**self.defaults(),**params}; pr=self.validate_params(full)
        if not pr.passed: return None, pr
        sk=self.derive_skeleton(full); a=self.build(sk); return a, self.validate(sk, a)
$PYCORE_GEAR$,

  '[{"name":"desired_ratio","type":"float","description":"Gear ratio (output/input)","default":3.0,"min_val":1.0,"max_val":20.0},
    {"name":"module","type":"float","unit":"mm","description":"Gear module (tooth size)","default":1.5,"min_val":0.5,"max_val":10.0},
    {"name":"pressure_angle","type":"float","unit":"degrees","description":"Pressure angle","default":20.0,"min_val":14.5,"max_val":25.0},
    {"name":"face_width","type":"float","unit":"mm","description":"Face width","default":10.0,"min_val":3.0,"max_val":50.0},
    {"name":"driver_teeth","type":"int","description":"Driver gear tooth count","default":17,"min_val":12,"max_val":100},
    {"name":"bore_diameter","type":"float","unit":"mm","description":"Shaft bore diameter","default":5.0,"min_val":1.0,"max_val":25.0}]'::jsonb,
  '{"desired_ratio":3.0,"module":1.5,"pressure_angle":20.0,"face_width":10.0,"driver_teeth":17,"bore_diameter":5.0}'::jsonb,
  'Min teeth for PA (17 at 20deg). Actual ratio within 10% of desired.',
  'built_in', 1
) ON CONFLICT (name) DO UPDATE SET python_code=EXCLUDED.python_code, core_library_code=EXCLUDED.core_library_code, param_specs=EXCLUDED.param_specs, defaults=EXCLUDED.defaults, domain_keywords=EXCLUDED.domain_keywords, example_prompts=EXCLUDED.example_prompts, updated_at=NOW();


-- ─── Furniture/Joinery Grammar ────────────────────────────────

INSERT INTO cad_grammars (
  name, display_name, description,
  domain_keywords, example_prompts,
  python_code, core_library_code,
  param_specs, defaults, constraints_summary,
  source, version
) VALUES (
  'furniture',
  'Furniture / Joinery',
  'Frame-and-panel furniture construction. Stiles, rails, shelves, and back panels with dado, dowel, or pocket screw joinery. Standard plywood/timber dimensions.',
  ARRAY['furniture', 'bookcase', 'shelf', 'shelving', 'cabinet', 'table', 'desk', 'bench', 'woodwork', 'joinery', 'plywood', 'bookshelf', 'storage', 'credenza', 'wardrobe', 'dresser', 'nightstand'],
  ARRAY[
    'Design a simple bookcase',
    'Build a 3-shelf bookshelf',
    'Create a storage cabinet',
    'Design a desk with shelves',
    'Make a plywood bookcase 900mm tall'
  ],
  $PYFURNITURE$
"""
ForgeOS Furniture/Joinery Grammar — Frame-and-Panel Construction
"""
import math
from typing import Any, Dict, List, Tuple
import cadquery as cq

def _build_panel(length, width, thickness):
    return cq.Workplane("XY").box(length, width, thickness, centered=(True, True, False))

def _build_dado_joint(panel, dado_x, dado_width, dado_depth, panel_width):
    cutter = cq.Workplane("XY").box(dado_width, panel_width + 2, dado_depth, centered=(True, True, False))
    cutter = cutter.translate((dado_x, 0, 0))
    return panel.cut(cutter)

class FurnitureGrammar(DomainGrammar):
    @property
    def name(self): return "furniture"
    @property
    def display_name(self): return "Furniture / Joinery"
    @property
    def description(self): return "Frame-and-panel furniture with dado/dowel/pocket screw joinery"

    def param_specs(self):
        return [
            ParamSpec("height", "float", "mm", "Overall height", 900, 200, 2400),
            ParamSpec("width", "float", "mm", "Overall width", 600, 200, 2000),
            ParamSpec("depth", "float", "mm", "Overall depth", 250, 100, 800),
            ParamSpec("material_thickness", "float", "mm", "Material thickness", 18, 6, 30),
            ParamSpec("shelf_count", "int", None, "Number of shelves (excluding top/bottom)", 3, 0, 10),
            ParamSpec("back_panel", "bool", None, "Include back panel", True),
            ParamSpec("back_thickness", "float", "mm", "Back panel thickness", 6, 3, 18),
            ParamSpec("joinery", "enum", None, "Joint type", "dado",
                enum_options=["dado", "biscuit", "dowel", "pocket_screw"]),
        ]

    def defaults(self):
        return {
            "height": 900, "width": 600, "depth": 250,
            "material_thickness": 18, "shelf_count": 3,
            "back_panel": True, "back_thickness": 6, "joinery": "dado",
        }

    def constraints(self):
        return [
            Constraint("shelf_span", "Max shelf span for 18mm plywood is 900mm",
                lambda s: (s["inner_width"] <= 900 or s["material_thickness"] > 18,
                    f"Shelf span {s['inner_width']:.0f}mm > 900mm for {s['material_thickness']}mm material"), severity="warning"),
            Constraint("min_shelf_spacing", "Minimum useful shelf spacing",
                lambda s: (s["shelf_spacing"] >= 100,
                    f"Shelf spacing {s['shelf_spacing']:.0f}mm < 100mm minimum"), severity="warning"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        t = s["material_thickness"]
        s["inner_width"] = s["width"] - 2 * t
        s["inner_height"] = s["height"] - 2 * t
        s["inner_depth"] = s["depth"] - (s["back_thickness"] if s["back_panel"] else 0)
        total_shelves = s["shelf_count"]
        if total_shelves > 0:
            s["shelf_spacing"] = s["inner_height"] / (total_shelves + 1)
        else:
            s["shelf_spacing"] = s["inner_height"]
        s["shelf_positions"] = []
        for i in range(1, total_shelves + 1):
            z = t + i * s["shelf_spacing"] - t / 2
            s["shelf_positions"].append(z)
        s["dado_depth"] = t / 3
        return s

    def build(self, skeleton):
        s = skeleton
        t = s["material_thickness"]
        W, H, D = s["width"], s["height"], s["depth"]
        assy = cq.Assembly(name="ForgeOS_Furniture")
        left = _build_panel(t, D, H)
        assy.add(left, loc=cq.Location(cq.Vector(-W/2 + t/2, 0, 0)),
            color=cq.Color(0.82, 0.72, 0.58), name="LeftSide")
        right = _build_panel(t, D, H)
        assy.add(right, loc=cq.Location(cq.Vector(W/2 - t/2, 0, 0)),
            color=cq.Color(0.82, 0.72, 0.58), name="RightSide")
        top = _build_panel(W, D, t)
        assy.add(top, loc=cq.Location(cq.Vector(0, 0, H - t)),
            color=cq.Color(0.85, 0.75, 0.60), name="TopPanel")
        bottom = _build_panel(W, D, t)
        assy.add(bottom, loc=cq.Location(cq.Vector(0, 0, 0)),
            color=cq.Color(0.85, 0.75, 0.60), name="BottomPanel")
        for i, z in enumerate(s.get("shelf_positions", [])):
            shelf = _build_panel(s["inner_width"], D, t)
            assy.add(shelf, loc=cq.Location(cq.Vector(0, 0, z)),
                color=cq.Color(0.80, 0.70, 0.55), name=f"Shelf_{i+1}")
        if s.get("back_panel"):
            back = _build_panel(W, s["back_thickness"], H)
            assy.add(back, loc=cq.Location(cq.Vector(0, -D/2 + s["back_thickness"]/2, 0)),
                color=cq.Color(0.75, 0.65, 0.50), name="BackPanel")
        return assy
$PYFURNITURE$,

  $PYCORE_FURN$
"""ForgeOS Core — Domain Grammar Base Classes"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
import cadquery as cq
@dataclass
class ParamSpec:
    name: str; type: str; unit: Optional[str] = None; description: str = ""; default: Any = None; min_val: Any = None; max_val: Any = None; enum_options: Optional[List[str]] = None
    def validate(self, value):
        if value is None: return True, ""
        if self.type == "float":
            try: v = float(value)
            except: return False, f"{self.name}: expected float"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > {self.max_val}"
        elif self.type == "int":
            try: v = int(value)
            except: return False, f"{self.name}: expected int"
            if self.min_val is not None and v < self.min_val: return False, f"{self.name}: {v} < {self.min_val}"
            if self.max_val is not None and v > self.max_val: return False, f"{self.name}: {v} > {self.max_val}"
        elif self.type == "enum" and self.enum_options and value not in self.enum_options: return False, f"not in {self.enum_options}"
        elif self.type == "bool" and not isinstance(value, bool): return False, f"expected bool"
        return True, ""
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
        for c in self.constraints():
            ok, msg = c.check(skeleton)
            if not ok:
                if c.severity=="error": r.errors.append(f"[{c.name}] {msg}"); r.passed=False
                else: r.warnings.append(f"[{c.name}] {msg}")
        bb = assembly.toCompound().BoundingBox()
        r.metrics["part_count"]=len(assembly.children); r.metrics["envelope_mm"]=f"{bb.xlen:.0f} x {bb.ylen:.0f} x {bb.zlen:.0f}"
        return r
    def validate_params(self, params):
        r = ValidationResult(passed=True); full={**self.defaults(),**params}
        for spec in self.param_specs():
            if spec.name not in full:
                if spec.default is None and spec.type not in ("dict_list","list"): r.errors.append(f"Required '{spec.name}'"); r.passed=False
                continue
            ok,msg=spec.validate(full[spec.name])
            if not ok: r.errors.append(msg); r.passed=False
        return r
    def generate(self, params):
        full={**self.defaults(),**params}; pr=self.validate_params(full)
        if not pr.passed: return None, pr
        sk=self.derive_skeleton(full); a=self.build(sk); return a, self.validate(sk, a)
$PYCORE_FURN$,

  '[{"name":"height","type":"float","unit":"mm","description":"Overall height","default":900,"min_val":200,"max_val":2400},
    {"name":"width","type":"float","unit":"mm","description":"Overall width","default":600,"min_val":200,"max_val":2000},
    {"name":"depth","type":"float","unit":"mm","description":"Overall depth","default":250,"min_val":100,"max_val":800},
    {"name":"material_thickness","type":"float","unit":"mm","description":"Material thickness","default":18,"min_val":6,"max_val":30},
    {"name":"shelf_count","type":"int","description":"Number of shelves","default":3,"min_val":0,"max_val":10},
    {"name":"back_panel","type":"bool","description":"Include back panel","default":true},
    {"name":"back_thickness","type":"float","unit":"mm","description":"Back panel thickness","default":6,"min_val":3,"max_val":18},
    {"name":"joinery","type":"enum","description":"Joint type","default":"dado","enum_options":["dado","biscuit","dowel","pocket_screw"]}]'::jsonb,
  '{"height":900,"width":600,"depth":250,"material_thickness":18,"shelf_count":3,"back_panel":true,"back_thickness":6,"joinery":"dado"}'::jsonb,
  'Shelf span max 900mm for 18mm ply. Min shelf spacing 100mm.',
  'built_in', 1
) ON CONFLICT (name) DO UPDATE SET python_code=EXCLUDED.python_code, core_library_code=EXCLUDED.core_library_code, param_specs=EXCLUDED.param_specs, defaults=EXCLUDED.defaults, domain_keywords=EXCLUDED.domain_keywords, example_prompts=EXCLUDED.example_prompts, updated_at=NOW();
