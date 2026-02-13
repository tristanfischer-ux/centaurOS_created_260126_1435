"""
ForgeOS Building Grammar — BIM-Aligned House Design
======================================================

Design patterns sourced from:
- IfcOpenShell / IfcOpenHouse tutorial (programmatic BIM)
- FreeCAD BIM module (wall centrelines, opening elements)
- UK Building Regulations (Part K stairs, Part L thermal)
- Gemini Deep Think V3 (pentagon gable, secant roof thickness)

Key patterns:
- Walls defined by CENTRELINE + thickness (not box dimensions)
- Openings as boolean cuts (not holes in sketch)
- Gable walls as pentagon profiles (not rectangle + triangle union)
- Roof from cross-section extrusion along ridge
- Spatial hierarchy: Foundation → Slabs → Walls → Openings → Roof

This grammar generates residential timber-frame buildings.
All dimensions in millimetres.
"""

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import cadquery as cq

from core.grammar import DomainGrammar, ParamSpec, Constraint, ValidationResult


# ═══════════════════════════════════════════════════════════════
# DATA STRUCTURES — BIM-style element specs
# ═══════════════════════════════════════════════════════════════

@dataclass
class OpeningSpec:
    """An opening (door/window) positioned along a wall baseline."""
    position_along_wall: float   # mm from wall start to opening centre
    sill_height: float           # mm from floor to bottom of opening
    width: float                 # mm
    height: float                # mm
    type: str = "window"         # "door", "window", "passage"


@dataclass
class WallSpec:
    """A wall defined BIM-style: centreline endpoints + height + thickness."""
    name: str
    start: Tuple[float, float]   # (x, y) centreline start
    end: Tuple[float, float]     # (x, y) centreline end
    height: float                # mm
    thickness: float             # mm
    is_gable: bool = False       # if True, extends to ridge as pentagon
    ridge_height: float = 0      # only used if is_gable=True
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

    @property
    def angle_deg(self) -> float:
        dx = self.end[0] - self.start[0]
        dy = self.end[1] - self.start[1]
        return math.degrees(math.atan2(dy, dx))

    @property
    def midpoint(self) -> Tuple[float, float]:
        return ((self.start[0] + self.end[0]) / 2,
                (self.start[1] + self.end[1]) / 2)


@dataclass
class SlabSpec:
    """A horizontal slab (floor/ceiling/foundation)."""
    name: str
    centre_x: float
    centre_y: float
    z: float
    length: float  # X dimension
    width: float   # Y dimension
    thickness: float
    color: Tuple[float, float, float] = (0.60, 0.58, 0.55)


@dataclass
class RoofSpec:
    """Roof defined by cross-section profile, extruded along ridge."""
    ridge_length: float    # extrusion length (with overhangs)
    half_span: float       # half the total width (with overhangs)
    rise: float            # vertical rise from eave to ridge
    thickness: float       # roof shell thickness (vertical at ridge)
    eaves_z: float         # Z of eave line
    overhang_drop: float   # how far eave drops below eaves_z
    offset_x: float        # X position of extrusion start
    centre_y: float        # Y centre of roof


# ═══════════════════════════════════════════════════════════════
# GEOMETRY PRIMITIVES — domain-specific shape generators
# ═══════════════════════════════════════════════════════════════

def _build_rect_wall(length: float, height: float, thickness: float) -> cq.Workplane:
    """
    Rectangular wall solid. Length along X, height along Z, thickness along Y.
    Origin at centre of base.
    """
    return cq.Workplane("XY").box(length, thickness, height,
                                  centered=(True, True, False))


def _build_gable_wall(width: float, eaves_z: float,
                      ridge_z: float, thickness: float) -> cq.Workplane:
    """
    Pentagon-profile gable wall. Profile in YZ plane, extruded along X.
    
    This is the BIM best practice — a single 5-point polygon that goes:
    bottom-left → bottom-right → right-eave → ridge-peak → left-eave.
    No boolean unions, no clipping planes. Just one extrusion.
    
    Origin at (0, 0, 0) = bottom-left corner.
    Width runs along Y, height along Z, thickness along X.
    """
    pts = [
        (0, 0),
        (width, 0),
        (width, eaves_z),
        (width / 2, ridge_z),
        (0, eaves_z),
    ]
    return cq.Workplane("YZ").polyline(pts).close().extrude(thickness)


def _cut_opening(wall: cq.Workplane, cx: float, cy: float,
                 cz: float, width: float, height: float,
                 depth: float) -> cq.Workplane:
    """
    Boolean-cut a rectangular opening through a wall solid.
    
    cx, cy, cz: centre of opening in wall's local coordinate space.
    depth: must exceed wall thickness for clean through-cut.
    """
    cutter = (cq.Workplane("XY")
              .box(width, depth, height, centered=(True, True, True))
              .translate((cx, cy, cz)))
    return wall.cut(cutter)


def _build_roof_profile(half_span: float, rise: float,
                        overhang_drop: float, thickness: float,
                        ridge_length: float) -> cq.Workplane:
    """
    Roof as hexagonal cross-section extruded along ridge.
    
    Cross-section in YZ plane:
    - Outer: left-eave → ridge-peak → right-eave
    - Inner: offset inward by thickness
    
    The secant thickness (thickness / cos(pitch)) is handled by
    computing the inner profile points directly.
    """
    pts = [
        (-half_span, -overhang_drop),
        (0, rise),
        (half_span, -overhang_drop),
        (half_span, -overhang_drop - thickness),
        (0, rise - thickness),
        (-half_span, -overhang_drop - thickness),
    ]
    return cq.Workplane("YZ").polyline(pts).close().extrude(ridge_length)


def _build_staircase(total_rise: float, total_going: float,
                     width: float, num_risers: int) -> cq.Workplane:
    """
    Staircase as stepped profile extruded by width.
    Profile in XZ plane: step pattern from bottom-left to top-right.
    """
    riser_h = total_rise / num_risers
    tread_d = total_going / num_risers

    pts = [(0, 0)]
    for i in range(num_risers):
        pts.append((i * tread_d, (i + 1) * riser_h))
        pts.append(((i + 1) * tread_d, (i + 1) * riser_h))
    pts.append((total_going, 0))

    return cq.Workplane("XZ").polyline(pts).close().extrude(width)


# ═══════════════════════════════════════════════════════════════
# BUILDING GRAMMAR — the main class
# ═══════════════════════════════════════════════════════════════

class BuildingGrammar(DomainGrammar):

    @property
    def name(self) -> str:
        return "building"

    @property
    def display_name(self) -> str:
        return "Building / Architecture"

    @property
    def description(self) -> str:
        return "Residential timber-frame buildings with BIM-aligned geometry"

    def param_specs(self) -> List[ParamSpec]:
        return [
            ParamSpec("length", "float", "mm",
                      "Overall building length (X axis)", 12000, 3000, 30000),
            ParamSpec("width", "float", "mm",
                      "Overall building width (Y axis)", 3658, 2400, 12000),
            ParamSpec("ridge_height", "float", "mm",
                      "Ridge height from finished floor level", 6000, 3000, 15000),
            ParamSpec("roof_pitch_deg", "float", "degrees",
                      "Roof pitch angle", 20.0, 5.0, 60.0),
            ParamSpec("ext_wall_thickness", "float", "mm",
                      "Exterior wall thickness", 195, 100, 400),
            ParamSpec("int_wall_thickness", "float", "mm",
                      "Interior partition thickness", 114, 75, 200),
            ParamSpec("roof_thickness", "float", "mm",
                      "Roof shell thickness (vertical)", 200, 100, 400),
            ParamSpec("roof_overhang", "float", "mm",
                      "Roof overhang beyond wall face", 200, 0, 600),
            ParamSpec("ground_floor_height", "float", "mm",
                      "Ground floor ceiling height", 3000, 2400, 4000),
            ParamSpec("has_loft", "bool", None,
                      "Include loft floor and staircase", True),
            ParamSpec("loft_length", "float", "mm",
                      "Loft floor length (from right gable inward)", 5000, 2000, None),
            ParamSpec("partition_positions", "list", "mm",
                      "X positions of internal partitions", None),
            ParamSpec("front_openings", "dict_list", None,
                      "Front wall openings [{position_along_wall, sill_height, width, height, type}]", None),
            ParamSpec("rear_openings", "dict_list", None,
                      "Rear wall openings [{position_along_wall, sill_height, width, height, type}]", None),
            ParamSpec("left_openings", "dict_list", None,
                      "Left gable openings [{sill_height, width, height, type}]", None),
            ParamSpec("right_openings", "dict_list", None,
                      "Right gable openings [{sill_height, width, height, type}]", None),
        ]

    def defaults(self) -> Dict[str, Any]:
        return {
            "length": 12000,
            "width": 3658,
            "ridge_height": 6000,
            "roof_pitch_deg": 20.0,
            "ext_wall_thickness": 195,
            "int_wall_thickness": 114,
            "roof_thickness": 200,
            "roof_overhang": 200,
            "ground_floor_height": 3000,
            "has_loft": True,
            "loft_length": 5000,
            "partition_positions": [5300, 8000, 10000],
            "front_openings": [
                {"position_along_wall": 1500, "sill_height": 0, "width": 1070, "height": 2100, "type": "door"},
                {"position_along_wall": 3500, "sill_height": 900, "width": 1220, "height": 1420, "type": "window"},
                {"position_along_wall": 5000, "sill_height": 900, "width": 1220, "height": 1420, "type": "window"},
            ],
            "rear_openings": [
                {"position_along_wall": 10500, "sill_height": 0, "width": 920, "height": 2100, "type": "door"},
                {"position_along_wall": 6700, "sill_height": 900, "width": 1020, "height": 1020, "type": "window"},
            ],
            "left_openings": [
                {"sill_height": 900, "width": 1020, "height": 1020, "type": "window"},
                {"sill_height": None, "width": 820, "height": 1020, "type": "window"},  # loft window, sill auto-calc
            ],
            "right_openings": [
                {"sill_height": None, "width": 820, "height": 1020, "type": "window"},  # loft window
            ],
        }

    def constraints(self) -> List[Constraint]:
        return [
            Constraint(
                "min_ceiling_height",
                "UK Building Regs: habitable rooms min 2100mm floor to ceiling",
                lambda s: (s["ground_floor_height"] >= 2100,
                           f"Floor height {s['ground_floor_height']}mm < 2100mm minimum"),
                severity="error"
            ),
            Constraint(
                "stair_geometry",
                "UK Part K: 2R + G must be 550-700mm",
                lambda s: _check_stair_geometry(s),
                severity="warning"
            ),
            Constraint(
                "roof_pitch_range",
                "Roof pitch must be reasonable for covering type",
                lambda s: (5 <= s["roof_pitch_deg"] <= 60,
                           f"Pitch {s['roof_pitch_deg']}° outside 5-60° range"),
                severity="warning"
            ),
            Constraint(
                "ridge_above_eaves",
                "Ridge must be above eaves line",
                lambda s: (s["ridge_height"] > s["eaves_height"],
                           f"Ridge {s['ridge_height']}mm <= eaves {s['eaves_height']}mm"),
                severity="error"
            ),
        ]

    # ─── Level 2: Derive skeleton ─────────────────────────────

    def derive_skeleton(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute all derived dimensions from user parameters.
        Pure math — no geometry operations.
        
        Skeleton keys produced (in addition to all input params):
        
        Roof geometry:
            roof_rise           mm    vertical rise from eaves to ridge
            eaves_height        mm    height of eaves line from FFL
            interior_width      mm    clear width between exterior wall inner faces
            roof_total_width    mm    full roof width including overhangs
            roof_half_span      mm    half of roof_total_width
            roof_overhang_drop  mm    vertical drop at eave overhang tip
            roof_profile_height mm    vertical extent of roof shell
        
        Loft geometry (when has_loft=True):
            loft_floor_z        mm    Z of loft floor (= ground_floor_height)
            loft_headroom       mm    clear height at loft perimeter wall
            loft_stair_going    mm    horizontal depth of staircase
            loft_stair_risers   int   number of stair risers
            loft_stair_riser_h  mm    individual riser height
            loft_stair_tread_d  mm    individual tread depth (going / (risers-1))
        
        Geometry specs (passed to build):
            wall_specs          list[WallSpec]    exterior + gable + partition walls
            slab_specs          list[SlabSpec]     ground slab + loft floor
            roof_specs          list[RoofSpec]     left + right roof halves
            front_opening_specs list[OpeningSpec]  front wall openings
            rear_opening_specs  list[OpeningSpec]  rear wall openings
        """
        s = dict(params)  # copy

        L = s["length"]
        W = s["width"]
        pitch = math.radians(s["roof_pitch_deg"])
        ext_t = s["ext_wall_thickness"]

        # Roof geometry
        s["roof_rise"] = (W / 2) * math.tan(pitch)
        s["eaves_height"] = s["ridge_height"] - s["roof_rise"]

        # Interior width (between exterior wall inner faces)
        s["interior_width"] = W - 2 * ext_t

        # Roof dimensions with overhang
        overhang = s["roof_overhang"]
        s["roof_total_width"] = W + 2 * overhang
        s["roof_half_span"] = s["roof_total_width"] / 2
        s["roof_overhang_drop"] = overhang * math.tan(pitch)
        s["roof_ridge_length"] = L + 2 * overhang
        s["roof_secant_thickness"] = s["roof_thickness"] / math.cos(pitch)

        # Loft
        if s.get("has_loft"):
            s["loft_x_start"] = L - ext_t - s["loft_length"]
            s["stair_total_rise"] = s["ground_floor_height"] + 250  # slab thickness
            s["stair_num_risers"] = 15
            s["stair_total_going"] = s["stair_num_risers"] * 220
            s["stair_width"] = 800
            s["stair_riser_height"] = s["stair_total_rise"] / s["stair_num_risers"]
            s["stair_going"] = s["stair_total_going"] / s["stair_num_risers"]
            # UK Part K check values
            s["stair_2r_plus_g"] = 2 * s["stair_riser_height"] + s["stair_going"]

        # Foundation
        s["foundation_length"] = L + 200
        s["foundation_width"] = W + 200
        s["foundation_thickness"] = 200
        s["ground_slab_thickness"] = 150

        return s

    # ─── Level 3: Build geometry ──────────────────────────────

    def build(self, skeleton: Dict[str, Any]) -> cq.Assembly:
        """Generate CadQuery Assembly from derived skeleton."""
        s = skeleton
        L = s["length"]
        W = s["width"]
        ext_t = s["ext_wall_thickness"]
        int_t = s["int_wall_thickness"]
        int_w = s["interior_width"]
        eaves = s["eaves_height"]
        ridge = s["ridge_height"]
        gf_h = s["ground_floor_height"]

        house = cq.Assembly(name="ForgeOS_House")

        # ── Foundation & ground slab ──
        house.add(
            cq.Workplane("XY").box(s["foundation_length"], s["foundation_width"],
                                   s["foundation_thickness"],
                                   centered=(True, True, False)),
            loc=cq.Location(cq.Vector(L / 2, W / 2, -s["foundation_thickness"])),
            color=cq.Color(0.50, 0.50, 0.50), name="Foundation")

        house.add(
            cq.Workplane("XY").box(L, W, s["ground_slab_thickness"],
                                   centered=(True, True, False)),
            loc=cq.Location(cq.Vector(L / 2, W / 2, -s["ground_slab_thickness"])),
            color=cq.Color(0.60, 0.58, 0.55), name="GroundSlab")

        # ── Front wall (Y=0 face, runs along X) ──
        fw = _build_rect_wall(L, eaves, ext_t)
        for op_dict in s.get("front_openings", []):
            op = _parse_opening(op_dict)
            cx = -L / 2 + op.position_along_wall
            cz = op.sill_height + op.height / 2
            fw = _cut_opening(fw, cx, 0, cz, op.width, op.height, ext_t + 100)
        house.add(fw,
                  loc=cq.Location(cq.Vector(L / 2, ext_t / 2, 0)),
                  color=cq.Color(0.92, 0.90, 0.85), name="FrontWall")

        # ── Rear wall (Y=W face, runs along X) ──
        rw = _build_rect_wall(L, eaves, ext_t)
        for op_dict in s.get("rear_openings", []):
            op = _parse_opening(op_dict)
            cx = -L / 2 + op.position_along_wall
            cz = op.sill_height + op.height / 2
            rw = _cut_opening(rw, cx, 0, cz, op.width, op.height, ext_t + 100)
        house.add(rw,
                  loc=cq.Location(cq.Vector(L / 2, W - ext_t / 2, 0)),
                  color=cq.Color(0.92, 0.90, 0.85), name="RearWall")

        # ── Left gable wall (X=0 face, pentagon) ──
        lw = _build_gable_wall(W, eaves, ridge, ext_t)
        left_ops = s.get("left_openings", [])
        if left_ops:
            for op_dict in left_ops:
                op = _parse_opening(op_dict)
                sill = op.sill_height
                if sill is None:
                    sill = eaves - 200  # auto-position near top for loft windows
                cz = sill + op.height / 2
                # Gable wall: X is thickness, Y is width, Z is height
                lw = _cut_opening(lw, ext_t / 2, W / 2, cz,
                                  ext_t + 100, op.width, op.height)
        house.add(lw,
                  loc=cq.Location(cq.Vector(0, 0, 0)),
                  color=cq.Color(0.92, 0.90, 0.85), name="LeftGableWall")

        # ── Right gable wall (X=L face, pentagon) ──
        rg = _build_gable_wall(W, eaves, ridge, ext_t)
        right_ops = s.get("right_openings", [])
        if right_ops:
            for op_dict in right_ops:
                op = _parse_opening(op_dict)
                sill = op.sill_height
                if sill is None:
                    sill = gf_h + 400  # loft level
                cz = sill + op.height / 2
                rg = _cut_opening(rg, ext_t / 2, W / 2, cz,
                                  ext_t + 100, op.width, op.height)
        house.add(rg,
                  loc=cq.Location(cq.Vector(L - ext_t, 0, 0)),
                  color=cq.Color(0.92, 0.90, 0.85), name="RightGableWall")

        # ── Interior partitions ──
        for i, px in enumerate(s.get("partition_positions", [])):
            part = _build_rect_wall(int_w, gf_h, int_t)
            # Standard internal door opening
            part = _cut_opening(part, 0, 0, 2032 / 2, 833, 2032, int_t + 100)
            loc = (cq.Location(cq.Vector(px, W / 2, 0)) *
                   cq.Location(cq.Vector(0, 0, 0), cq.Vector(0, 0, 1), 90))
            house.add(part, loc=loc,
                      color=cq.Color(0.95, 0.93, 0.90), name=f"Partition_{i + 1}")

        # ── Roof ──
        roof = _build_roof_profile(
            s["roof_half_span"], s["roof_rise"],
            s["roof_overhang_drop"], s["roof_thickness"],
            s["roof_ridge_length"])
        house.add(roof,
                  loc=cq.Location(cq.Vector(-s["roof_overhang"], W / 2, eaves)),
                  color=cq.Color(0.30, 0.25, 0.22), name="Roof")

        # ── Loft floor and ceiling ──
        if s.get("has_loft"):
            loft_len = s["loft_length"]
            loft_x = s["loft_x_start"]

            # Loft floor slab
            house.add(
                cq.Workplane("XY").box(loft_len, int_w, 250,
                                       centered=(True, True, False)),
                loc=cq.Location(cq.Vector(loft_x + loft_len / 2, W / 2, gf_h)),
                color=cq.Color(0.82, 0.72, 0.58), name="LoftFloor")

            # Ceiling over non-loft area
            ceil_len = loft_x - ext_t
            if ceil_len > 0:
                house.add(
                    cq.Workplane("XY").box(ceil_len, int_w, 220,
                                           centered=(True, True, False)),
                    loc=cq.Location(cq.Vector(ext_t + ceil_len / 2, W / 2, gf_h)),
                    color=cq.Color(0.94, 0.92, 0.88), name="CeilingSlab")

            # Loft guardrail
            house.add(
                cq.Workplane("XY").box(50, int_w, 914,
                                       centered=(True, True, False)),
                loc=cq.Location(cq.Vector(loft_x, W / 2, gf_h + 250)),
                color=cq.Color(0.6, 0.6, 0.6), name="LoftGuardrail")

            # Staircase
            stair = _build_staircase(
                s["stair_total_rise"], s["stair_total_going"],
                s["stair_width"], s["stair_num_risers"])
            stair_x = loft_x - s["stair_total_going"]
            stair_y = W - ext_t - s["stair_width"]
            house.add(stair,
                      loc=cq.Location(cq.Vector(stair_x, stair_y, 0)),
                      color=cq.Color(0.72, 0.60, 0.48), name="Staircase")

            # Handrail
            angle = math.degrees(math.atan2(s["stair_total_rise"],
                                            s["stair_total_going"]))
            rail_len = math.sqrt(s["stair_total_going"] ** 2 +
                                 s["stair_total_rise"] ** 2)
            handrail = cq.Workplane("XY").box(rail_len, 40, 50,
                                              centered=(True, True, False))
            rail_loc = (
                cq.Location(cq.Vector(
                    stair_x + s["stair_total_going"] / 2,
                    stair_y,
                    s["stair_total_rise"] / 2 + 900)) *
                cq.Location(cq.Vector(0, 0, 0), cq.Vector(0, 1, 0), -angle))
            house.add(handrail, loc=rail_loc,
                      color=cq.Color(0.55, 0.55, 0.55), name="Handrail")

        return house


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _parse_opening(d: dict) -> OpeningSpec:
    """Convert a dict to an OpeningSpec, handling None values."""
    return OpeningSpec(
        position_along_wall=d.get("position_along_wall", 0),
        sill_height=d.get("sill_height"),
        width=d.get("width", 1000),
        height=d.get("height", 1000),
        type=d.get("type", "window"),
    )


def _check_stair_geometry(s: dict) -> Tuple[bool, str]:
    """UK Part K stair check: 2R + G must be 550-700mm."""
    if not s.get("has_loft"):
        return True, ""
    val = s.get("stair_2r_plus_g", 0)
    if 550 <= val <= 700:
        return True, ""
    return False, f"2R+G = {val:.0f}mm (should be 550-700mm)"
