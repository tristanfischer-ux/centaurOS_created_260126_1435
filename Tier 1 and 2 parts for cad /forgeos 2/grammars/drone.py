"""
ForgeOS Drone Grammar — FPV Quadcopter Design
================================================

Generates FPV racing/freestyle quadcopter frames in X-configuration.
All dimensions in mm. CNC-cut carbon fibre plates or 3D-printed.

Architecture:
  - Centre plates (top + bottom) sandwich electronics with standoffs
  - 4 arms radiate from centre at 90° intervals
  - Motor mounts at arm tips with standardised bolt patterns
  - Camera mount at front, battery pad at bottom

Key sizing rule: prop_size → wheelbase → arm_length → all other dimensions.

Sources: TBS Source One, BetaFlight community conventions, Oscar Liang builds.
"""

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import cadquery as cq

from core.grammar import DomainGrammar, ParamSpec, Constraint, ValidationResult


# ═══════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════

@dataclass
class MotorSpec:
    """Motor physical dimensions and bolt pattern."""
    name: str                        # e.g. "2306"
    stator_diameter: float           # mm
    stator_height: float             # mm
    bolt_pattern: float              # mm (16, 19, etc.)
    bolt_size: str                   # "M2" or "M3"
    shaft_diameter: float = 5.0      # mm
    bell_diameter: float = 28.0      # mm (outer bell)
    height: float = 32.0             # mm (total)
    weight: float = 30.0             # grams

    @property
    def bolt_hole_positions(self) -> List[Tuple[float, float]]:
        """Returns (x, y) positions of the 4 bolt holes relative to motor centre."""
        half = self.bolt_pattern / 2
        return [(-half, -half), (-half, half), (half, -half), (half, half)]


@dataclass
class FCStackSpec:
    """Flight controller stack dimensions."""
    name: str                        # e.g. "30.5×30.5 Standard"
    hole_spacing: float              # mm (30.5 for standard)
    bolt_size: str                   # "M3"
    board_width: float = 36.0        # mm (typical PCB width)
    board_length: float = 36.0       # mm
    stack_height: float = 20.0       # mm (FC + ESC + VTX stacked)

    @property
    def bolt_hole_positions(self) -> List[Tuple[float, float]]:
        half = self.hole_spacing / 2
        return [(-half, -half), (-half, half), (half, -half), (half, half)]


# ═══════════════════════════════════════════════════════════════
# COMPONENT LIBRARY — standard parts database
# ═══════════════════════════════════════════════════════════════

MOTOR_PRESETS = {
    "1404": MotorSpec("1404", 14, 4, 9, "M2", 1.5, 18, 15, 10),
    "2004": MotorSpec("2004", 20, 4, 16, "M3", 5.0, 24, 20, 18),
    "2207": MotorSpec("2207", 22, 7, 16, "M3", 5.0, 28, 30, 30),
    "2306": MotorSpec("2306", 23, 6, 16, "M3", 5.0, 28, 32, 33),
    "2806": MotorSpec("2806", 28, 6, 19, "M3", 5.0, 34, 35, 45),
}

FC_PRESETS = {
    "20mm": FCStackSpec("20×20 Mini", 20, "M2", 26, 26, 15),
    "25.5mm": FCStackSpec("25.5×25.5 Whoop", 25.5, "M2", 30, 30, 15),
    "30.5mm": FCStackSpec("30.5×30.5 Standard", 30.5, "M3", 36, 36, 20),
}

# Prop diameter in mm for common inch sizes
PROP_SIZES = {
    "3inch": 76.2,
    "5inch": 127.0,
    "6inch": 152.4,
    "7inch": 177.8,
}


# ═══════════════════════════════════════════════════════════════
# GEOMETRY PRIMITIVES
# ═══════════════════════════════════════════════════════════════

def _build_centre_plate(length: float, width: float, thickness: float,
                        corner_r: float, stack_holes: List[Tuple[float, float]],
                        stack_bolt_d: float,
                        standoff_holes: List[Tuple[float, float]] = None,
                        standoff_bolt_d: float = 3.2) -> cq.Workplane:
    """
    Generate a centre plate (top or bottom).
    Rounded rectangle with bolt holes for FC stack and standoffs.
    Origin at centre of plate.
    """
    plate = (cq.Workplane("XY")
             .rect(length, width)
             .extrude(thickness))

    # Round the corners by filleting vertical edges
    if corner_r > 0:
        try:
            plate = plate.edges("|Z").fillet(corner_r)
        except Exception:
            pass  # fillet can fail on very small plates; skip gracefully

    # Cut FC stack bolt holes
    for (hx, hy) in stack_holes:
        hole = (cq.Workplane("XY")
                .circle(stack_bolt_d / 2)
                .extrude(thickness * 3))
        plate = plate.cut(hole.translate((hx, hy, -thickness)))

    # Cut standoff holes
    if standoff_holes:
        for (hx, hy) in standoff_holes:
            hole = (cq.Workplane("XY")
                    .circle(standoff_bolt_d / 2)
                    .extrude(thickness * 3))
            plate = plate.cut(hole.translate((hx, hy, -thickness)))

    return plate


def _build_arm(length: float, root_width: float, tip_width: float,
               thickness: float, motor_bolt_pattern: float,
               motor_bolt_d: float) -> cq.Workplane:
    """
    Generate a single arm as a tapered plate.
    Root (x=0) is wider, tip (x=length) is narrower.
    Motor bolt holes at tip in square pattern.
    Origin at centre of root edge, base at Z=0.
    """
    # Tapered profile as 4-point polygon in XY plane
    pts = [
        (0, -root_width / 2),
        (length, -tip_width / 2),
        (length, tip_width / 2),
        (0, root_width / 2),
    ]
    arm = cq.Workplane("XY").polyline(pts).close().extrude(thickness)

    # Motor bolt holes at tip (4× in square pattern)
    half_bolt = motor_bolt_pattern / 2
    for dx, dy in [(-half_bolt, -half_bolt), (-half_bolt, half_bolt),
                   (half_bolt, -half_bolt), (half_bolt, half_bolt)]:
        hole = (cq.Workplane("XY")
                .circle(motor_bolt_d / 2)
                .extrude(thickness * 3))
        arm = arm.cut(hole.translate((length + dx, dy, -thickness)))

    return arm


def _build_standoff(height: float, outer_d: float = 6.0,
                    inner_d: float = 3.2) -> cq.Workplane:
    """
    Generate a standoff cylinder.
    
    Simple hollow cylinder. Off-the-shelf M3 aluminium standoffs.
    """
    return (cq.Workplane("XY")
            .circle(outer_d / 2)
            .circle(inner_d / 2)
            .extrude(height))


def _build_motor_proxy(spec: MotorSpec) -> cq.Workplane:
    """
    Generate a LOD2 proxy for a motor (cylinder + bell).
    
    Not the actual motor — just enough geometry to show placement and clearance.
    """
    # Motor base (stator)
    motor = (cq.Workplane("XY")
             .circle(spec.bell_diameter / 2)
             .extrude(spec.height))
    # Shaft
    shaft = (cq.Workplane("XY")
             .circle(spec.shaft_diameter / 2)
             .extrude(spec.height + 5))
    return motor.union(shaft)


def _build_prop_disc(diameter: float, thickness: float = 1.0) -> cq.Workplane:
    """
    Transparent prop disc for clearance visualisation.
    Not a real part — just shows the prop sweep area.
    """
    return (cq.Workplane("XY")
            .circle(diameter / 2)
            .extrude(thickness))


# ═══════════════════════════════════════════════════════════════
# DRONE GRAMMAR
# ═══════════════════════════════════════════════════════════════

class DroneGrammar(DomainGrammar):

    @property
    def name(self) -> str:
        return "drone"

    @property
    def display_name(self) -> str:
        return "FPV Quadcopter"

    @property
    def description(self) -> str:
        return "FPV racing/freestyle quadcopter frames (X-configuration)"

    def param_specs(self) -> List[ParamSpec]:
        return [
            ParamSpec("prop_size_inch", "float", "inch",
                      "Propeller diameter", 5.0, 2.0, 10.0),
            ParamSpec("motor_size", "enum", None,
                      "Motor stator size", "2306",
                      enum_options=list(MOTOR_PRESETS.keys())),
            ParamSpec("fc_stack_size", "enum", None,
                      "Flight controller stack mounting pattern", "30.5mm",
                      enum_options=list(FC_PRESETS.keys())),
            ParamSpec("frame_material", "enum", None,
                      "Frame material", "carbon_fibre",
                      enum_options=["carbon_fibre", "3d_print_tpu", "3d_print_petg"]),
            ParamSpec("arm_thickness", "float", "mm",
                      "Arm plate thickness", None, 3.0, 8.0),
            ParamSpec("top_plate_thickness", "float", "mm",
                      "Top plate thickness", 2.0, 1.5, 4.0),
            ParamSpec("bottom_plate_thickness", "float", "mm",
                      "Bottom plate thickness", 2.0, 1.5, 4.0),
            ParamSpec("standoff_height", "float", "mm",
                      "Standoff height between plates", 25.0, 15.0, 40.0),
            ParamSpec("camera_tilt_deg", "float", "degrees",
                      "FPV camera tilt angle", 25.0, 0.0, 45.0),
            ParamSpec("prop_clearance_mm", "float", "mm",
                      "Minimum clearance between prop tips", 8.0, 3.0, 20.0),
            ParamSpec("config_type", "enum", None,
                      "Arm configuration", "true_x",
                      enum_options=["true_x", "stretch_x", "squished_x", "deadcat"]),
        ]

    def defaults(self) -> Dict[str, Any]:
        return {
            "prop_size_inch": 5.0,
            "motor_size": "2306",
            "fc_stack_size": "30.5mm",
            "frame_material": "carbon_fibre",
            "arm_thickness": None,  # auto-derive from prop size + material
            "top_plate_thickness": 2.0,
            "bottom_plate_thickness": 2.0,
            "standoff_height": 25.0,
            "camera_tilt_deg": 25.0,
            "prop_clearance_mm": 8.0,
            "config_type": "true_x",
        }

    def constraints(self) -> List[Constraint]:
        return [
            Constraint(
                "prop_clearance",
                "Prop tips must not overlap or be dangerously close",
                lambda s: _check_prop_clearance(s),
                severity="error"
            ),
            Constraint(
                "motor_fits_arm",
                "Motor bell must fit within arm tip width",
                lambda s: (s["arm_tip_width"] >= s["motor_bell_d"] + 2,
                           f"Arm tip {s['arm_tip_width']:.0f}mm < motor bell {s['motor_bell_d']:.0f}mm + 2mm clearance"),
                severity="error"
            ),
            Constraint(
                "stack_fits_plates",
                "FC stack must fit within centre plate dimensions",
                lambda s: (s["centre_plate_width"] >= s["fc_board_width"] + 4,
                           f"Plate width {s['centre_plate_width']:.0f}mm < FC board {s['fc_board_width']:.0f}mm + 4mm clearance"),
                severity="error"
            ),
        ]

    def derive_skeleton(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute all derived dimensions from user parameters.
        
        This is the core intelligence — converting high-level choices
        (prop size, motor, material) into every dimension needed to cut plates.
        
        Skeleton keys produced (in addition to all input params):
        
        Motor/FC resolved specs:
            motor_bell_d, motor_bolt_pattern, motor_bolt_size, motor_height
            fc_hole_spacing, fc_board_width, fc_board_length, fc_bolt_size
        
        Sizing (all mm):
            prop_diameter_mm     prop diameter converted from inches
            wheelbase            diagonal motor-to-motor distance
            arm_length           centre to motor mount (wheelbase/2)
            arm_root_width       arm width at centre plate
            arm_tip_width        arm width at motor
            arm_thickness        plate thickness (auto-derived from material + prop size)
        
        Centre plate:
            centre_plate_length, centre_plate_width, centre_plate_corner_r
        
        Assembly:
            standoff_positions   list[(x,y)] — 4 bolt hole positions for FC stack
            motor_positions      list[(x,y)] — 4 motor centres in frame coords
            estimated_frame_weight_g  rough weight estimate
        """
        s = dict(params)

        # Resolve presets
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

        # Prop dimensions
        prop_d = s["prop_size_inch"] * 25.4  # convert to mm
        s["prop_diameter_mm"] = prop_d
        prop_r = prop_d / 2

        # Wheelbase from prop size + clearance
        # For X-config: adjacent motors are at 90° apart
        # Distance between adjacent motor centres = wheelbase * sin(45°) = wheelbase / √2
        # This distance must be > prop_diameter + clearance
        min_adjacent_distance = prop_d + s["prop_clearance_mm"]
        s["wheelbase"] = min_adjacent_distance * math.sqrt(2) * 1.05  # 5% margin

        # Arm geometry (X-config: arms at 45° from forward axis)
        s["arm_length"] = s["wheelbase"] / 2  # centre to motor
        s["arm_root_width"] = motor.bell_diameter + 4  # at centre plate
        s["arm_tip_width"] = motor.bell_diameter + 2  # at motor

        # Auto-derive arm thickness from prop size + material
        if s["arm_thickness"] is None:
            material = s["frame_material"]
            if material == "carbon_fibre":
                s["arm_thickness"] = max(3.0, s["prop_size_inch"] * 0.8)
            elif material in ("3d_print_tpu", "3d_print_petg"):
                s["arm_thickness"] = max(5.0, s["prop_size_inch"] * 1.4)

        # Centre plate sizing
        s["centre_plate_length"] = max(
            fc.board_length + 10,
            s["arm_root_width"] * 1.5
        )
        s["centre_plate_width"] = max(
            fc.board_width + 10,
            s["arm_root_width"] * 1.5
        )
        s["centre_plate_corner_r"] = 3.0

        # Standoff positions (4 corners of FC stack, plus optional 2 extra)
        s["standoff_positions"] = fc.bolt_hole_positions

        # Motor positions (relative to frame centre)
        arm_offset = s["arm_length"]
        if s["config_type"] == "true_x":
            # Arms at ±45°, ±135° from forward (Y) axis
            s["motor_positions"] = [
                (arm_offset * math.cos(math.radians(a)),
                 arm_offset * math.sin(math.radians(a)))
                for a in [45, 135, 225, 315]
            ]
        elif s["config_type"] == "stretch_x":
            # Stretched X: wider forward/back, narrower left/right
            # Scale arm_offset up to maintain prop clearance
            stretch_offset = arm_offset * 1.2
            s["motor_positions"] = [
                (stretch_offset * math.cos(math.radians(a)),
                 stretch_offset * math.sin(math.radians(a)))
                for a in [55, 125, 235, 305]
            ]
        else:
            # Default to true X
            s["motor_positions"] = [
                (arm_offset * math.cos(math.radians(a)),
                 arm_offset * math.sin(math.radians(a)))
                for a in [45, 135, 225, 315]
            ]

        # Weight estimation
        if s["frame_material"] == "carbon_fibre":
            cf_density = 1.55  # g/cm³
            # Very rough: arm volume + 2 plates
            arm_vol_cm3 = (s["arm_length"] * s["arm_root_width"] * s["arm_thickness"]) / 1000  # rough
            plate_vol_cm3 = (s["centre_plate_length"] * s["centre_plate_width"] *
                             s["top_plate_thickness"]) / 1000
            s["estimated_frame_weight_g"] = (4 * arm_vol_cm3 + 2 * plate_vol_cm3) * cf_density

        return s

    def build(self, skeleton: Dict[str, Any]) -> cq.Assembly:
        """Generate CadQuery Assembly from derived skeleton."""
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_Drone")

        motor = MOTOR_PRESETS[s["motor_size"]]
        fc = FC_PRESETS[s["fc_stack_size"]]
        bolt_d = 3.2 if motor.bolt_size == "M3" else 2.2

        # ── Centre plates (with bolt holes) ──
        top = _build_centre_plate(
            s["centre_plate_length"], s["centre_plate_width"],
            s["top_plate_thickness"], s["centre_plate_corner_r"],
            stack_holes=fc.bolt_hole_positions,
            stack_bolt_d=bolt_d,
            standoff_holes=s["standoff_positions"],
            standoff_bolt_d=bolt_d)
        assy.add(top,
                 loc=cq.Location(cq.Vector(0, 0, s["standoff_height"])),
                 color=cq.Color(0.15, 0.15, 0.15), name="TopPlate")

        bottom = _build_centre_plate(
            s["centre_plate_length"], s["centre_plate_width"],
            s["bottom_plate_thickness"], s["centre_plate_corner_r"],
            stack_holes=fc.bolt_hole_positions,
            stack_bolt_d=bolt_d,
            standoff_holes=s["standoff_positions"],
            standoff_bolt_d=bolt_d)
        assy.add(bottom,
                 loc=cq.Location(cq.Vector(0, 0, 0)),
                 color=cq.Color(0.15, 0.15, 0.15), name="BottomPlate")

        # ── Standoffs ──
        for i, (sx, sy) in enumerate(s["standoff_positions"]):
            standoff = _build_standoff(s["standoff_height"])
            assy.add(standoff,
                     loc=cq.Location(cq.Vector(sx, sy, s["bottom_plate_thickness"])),
                     color=cq.Color(0.7, 0.7, 0.7), name=f"Standoff_{i + 1}")

        # ── Arms (tapered with motor bolt holes) ──
        for i, (mx, my) in enumerate(s["motor_positions"]):
            arm_angle = math.degrees(math.atan2(my, mx))
            arm_len = math.sqrt(mx ** 2 + my ** 2)

            arm = _build_arm(
                arm_len, s["arm_root_width"], s["arm_tip_width"],
                s["arm_thickness"], motor.bolt_pattern, bolt_d)

            arm_loc = (cq.Location(cq.Vector(0, 0, s["standoff_height"] / 2)) *
                       cq.Location(cq.Vector(0, 0, 0), cq.Vector(0, 0, 1), arm_angle))
            assy.add(arm, loc=arm_loc,
                     color=cq.Color(0.12, 0.12, 0.12), name=f"Arm_{i + 1}")

        # ── Motor proxies (visual reference, not manufactured parts) ──
        for i, (mx, my) in enumerate(s["motor_positions"]):
            motor_proxy = _build_motor_proxy(motor)
            motor_z = s["standoff_height"] + s["top_plate_thickness"]
            assy.add(motor_proxy,
                     loc=cq.Location(cq.Vector(mx, my, motor_z)),
                     color=cq.Color(0.3, 0.3, 0.3), name=f"Motor_{i + 1}")

        # ── Prop discs (clearance visualisation, not manufactured parts) ──
        for i, (mx, my) in enumerate(s["motor_positions"]):
            disc = _build_prop_disc(s["prop_diameter_mm"])
            disc_z = s["standoff_height"] + s["top_plate_thickness"] + motor.height + 2
            assy.add(disc,
                     loc=cq.Location(cq.Vector(mx, my, disc_z)),
                     color=cq.Color(0.8, 0.2, 0.2, 0.2), name=f"PropDisc_{i + 1}")

        return assy


# ═══════════════════════════════════════════════════════════════
# CONSTRAINT HELPERS
# ═══════════════════════════════════════════════════════════════

def _check_prop_clearance(s: dict) -> Tuple[bool, str]:
    """Check that no two prop discs overlap."""
    positions = s.get("motor_positions", [])
    prop_r = s.get("prop_diameter_mm", 0) / 2
    clearance = s.get("prop_clearance_mm", 5)

    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            dx = positions[i][0] - positions[j][0]
            dy = positions[i][1] - positions[j][1]
            dist = math.sqrt(dx * dx + dy * dy)
            min_dist = 2 * prop_r + clearance
            if dist < min_dist:
                return False, (f"Motors {i + 1} and {j + 1}: distance {dist:.1f}mm "
                               f"< required {min_dist:.1f}mm")
    return True, ""
