# ForgeOS Architecture — Domain Grammar Specifications

## How to Use This Document

This document contains the specifications for domain grammars that have NOT YET been implemented. For each domain, it provides the exact primitives, sizing formulas, constraints, and assembly sequences needed to write a grammar.

**Already implemented** (see the code directly):
- Building grammar → `grammars/building.py` (15 parts, 10 tests)
- Drone grammar → `grammars/drone.py` (18 parts, 10 tests)

**To implement** (specs below):
- Electronics Enclosure (§1)
- Model Rocket (§2)
- Gear Train (§3)
- Furniture/Joinery (§4)

Follow `docs/GRAMMAR_AUTHORING.md` for the code template. Use `grammars/drone.py` as the closest reference pattern.

---

## 1. Electronics Enclosure Grammar

**Source knowledge:** YAPP Box (OpenSCAD), Ultimate Box Maker, snap-fit design guides, IEC 60529

**Design approach:** PCB-first. The PCB defines the inner cavity. Everything else is derived outward.

### 1.1 Primitives

```python
def _build_shell(length, width, height, wall_t, corner_r) -> cq.Workplane:
    """Hollow box: outer rect - inner rect, extruded. Origin at centre of base."""
    # outer = cq.Workplane("XY").rect(length, width).extrude(height)
    # inner = cq.Workplane("XY").rect(length-2*wall_t, width-2*wall_t).extrude(height-wall_t)
    # inner = inner.translate((0, 0, wall_t))  # floor thickness
    # shell = outer.cut(inner)
    # Optional: shell.edges("|Z").fillet(corner_r)

def _build_mount_post(height, od, bore_d) -> cq.Workplane:
    """Cylinder with central bore for screw. Origin at base centre."""
    # circle(od/2) - circle(bore_d/2), extrude(height)

def _build_port_cutout(face_solid, cx, cy, shape, w, h, depth) -> cq.Workplane:
    """Boolean cut a port opening (USB, power jack, etc) through a wall."""
    # Rectangular or circular cutter, translated to (cx, cy), cut from face

def _build_snap_fit(length, width, thickness, hook_height, hook_depth) -> cq.Workplane:
    """Cantilever snap-fit hook. L-shaped profile extruded by width."""
    # Profile: vertical beam + horizontal hook at top
    
def _build_vent_slots(face_w, face_h, slot_w, slot_h, slot_spacing, count) -> cq.Workplane:
    """Array of rectangular slots for ventilation. Returns combined cutter solid."""
```

### 1.2 Derive Skeleton Formulas

```python
def derive_skeleton(params):
    s = dict(params)
    
    # Inner cavity from PCB
    s["inner_length"] = s["pcb_length"] + 2 * s["pcb_clearance"]
    s["inner_width"]  = s["pcb_width"]  + 2 * s["pcb_clearance"]
    s["inner_height"] = s["pcb_standoff_height"] + s["pcb_thickness"] + s["component_height"] + s["lid_clearance"]
    
    # Outer dimensions
    s["outer_length"] = s["inner_length"] + 2 * s["wall_thickness"]
    s["outer_width"]  = s["inner_width"]  + 2 * s["wall_thickness"]
    s["outer_height"] = s["inner_height"] + s["wall_thickness"]  # floor
    
    # Split line
    s["base_height"] = s["outer_height"] * s["split_ratio"]  # e.g., 0.4
    s["lid_height"]  = s["outer_height"] - s["base_height"]
    
    # Lip for lid alignment
    s["lip_height"] = 3.0  # mm, typical
    s["lip_inset"]  = 1.0  # mm
    
    # Mount post positions (from PCB hole positions)
    # s["mount_positions"] = s["pcb_mount_holes"]  # list of (x, y) relative to PCB centre
    
    # Screw boss dimensions
    s["boss_od"] = s["screw_diameter"] * 2.5
    s["boss_bore"] = s["screw_diameter"] * 0.85  # pilot hole
    
    return s
```

### 1.3 Constraints

```python
Constraint("min_wall_thickness",
    "FDM minimum wall for structural integrity",
    lambda s: (s["wall_thickness"] >= 1.2,
               f"Wall {s['wall_thickness']}mm < 1.2mm FDM minimum"))

Constraint("snap_fit_ratio",
    "Cantilever L/t must be > 5 for nylon, > 10 for ABS/PLA",
    lambda s: (s["snap_length"] / s["snap_thickness"] > 8,
               f"Snap L/t = {s['snap_length']/s['snap_thickness']:.1f}, need > 8"))

Constraint("screw_boss_size",
    "Boss OD must be >= 2x screw diameter",
    lambda s: (s["boss_od"] >= s["screw_diameter"] * 2,
               f"Boss OD {s['boss_od']}mm < 2x screw {s['screw_diameter']}mm"))
```

### 1.4 Default Parameters (Arduino Uno Case)

```python
defaults = {
    "pcb_length": 68.6,        # Arduino Uno
    "pcb_width": 53.4,
    "pcb_thickness": 1.6,
    "pcb_mount_holes": [(-24.13, -22.86), (-24.13, 24.13), (27.94, -20.32), (27.94, 22.86)],
    "pcb_standoff_height": 5.0,
    "pcb_clearance": 1.5,
    "component_height": 15.0,   # tallest component above PCB
    "lid_clearance": 2.0,
    "wall_thickness": 2.0,
    "corner_radius": 2.0,
    "split_ratio": 0.4,
    "screw_diameter": 3.0,      # M3
    "closure_type": "screw",    # "screw" | "snap_fit" | "both"
    "manufacturing": "fdm",     # "fdm" | "sla" | "injection"
    "ports": [                  # list of port cutouts
        {"face": "left", "position_along": 0.5, "position_up": 0.3, "shape": "rect", "width": 12, "height": 11, "label": "USB-B"},
        {"face": "left", "position_along": 0.8, "position_up": 0.3, "shape": "circle", "diameter": 6, "label": "barrel_jack"},
    ],
    "vent_face": "right",
    "vent_slot_count": 5,
}
```

### 1.5 Expected Parts

Assembly should contain: Base, Lid, MountPost_1..4, (SnapFit_1..N or ScrewBoss_1..N), PortCutouts applied as boolean cuts to base/lid.

### 1.6 Assembly Sequence

1. Build base shell (lower portion)
2. Build lid shell (upper portion) with lip
3. Add mount posts inside base at PCB hole positions
4. Cut port openings through appropriate walls
5. Add closure features (snap fits or screw bosses)
6. Add ventilation slots if specified

---

## 2. Model Rocket Grammar

**Source knowledge:** OpenRocket, Barrowman equations, openrocketdoc Python API, NAR safety code

**Design approach:** Axisymmetric. Components stack linearly nose-to-tail. Nose cone from profile-of-revolution.

### 2.1 Primitives

```python
def _build_nose_cone(shape, length, diameter, wall_t) -> cq.Workplane:
    """Nose cone by revolving a profile curve around the central axis.
    Shapes: 'cone', 'ogive', 'haack', 'vonkarman', 'parabolic'.
    
    Haack series: r(x) = (R/√π) × √(θ - sin(2θ)/2 + C×sin³(θ))
    where θ = arccos(1 - 2x/L), C=0 → von Kármán (minimum drag)
    
    Simpler for MVP: use conical or ogive. Ogive radius = (D² + 4L²) / (4D).
    """

def _build_body_tube(length, od, wall_t) -> cq.Workplane:
    """Hollow cylinder. circle(od/2) - circle(od/2-wall_t), extrude(length)."""

def _build_fin(root_chord, tip_chord, span, sweep_angle, thickness) -> cq.Workplane:
    """Trapezoidal fin. 4-point polygon in XZ plane, extruded by thickness."""

def _build_centering_ring(od, id, thickness) -> cq.Workplane:
    """Annular disc. circle(od/2) - circle(id/2), extrude(thickness)."""

def _build_bulkhead(diameter, thickness) -> cq.Workplane:
    """Solid disc. circle(d/2), extrude(thickness)."""
```

### 2.2 Derive Skeleton Formulas

```python
# Stability: CP must be aft of CG by >= 1 calibre
s["calibre"] = s["body_diameter"]
s["stability_margin_cal"] = (s["cp_position"] - s["cg_position"]) / s["calibre"]
# Must be >= 1.0, prefer 1.5-2.0

# Barrowman CP for trapezoidal fins:
# X_cp_fins = X_fin_root + (root/3)×(root + 2×tip)/(root + tip) + (1/6)×(root + tip - root×tip/(root+tip))

# Total length = nose_length + body_lengths + transition_lengths
s["total_length"] = s["nose_length"] + sum(s["body_tube_lengths"])

# Fin geometry
s["fin_semi_span"] = s["fin_span"]
s["fin_mid_chord"] = (s["fin_root_chord"] + s["fin_tip_chord"]) / 2
```

### 2.3 Default Parameters (Estes Alpha-style)

```python
defaults = {
    "nose_shape": "ogive",
    "nose_length": 70,         # mm
    "body_diameter": 25.4,     # BT-50 (25.4mm OD)
    "body_wall_t": 0.5,
    "body_length": 200,
    "fin_count": 3,
    "fin_root_chord": 50,
    "fin_tip_chord": 25,
    "fin_span": 40,
    "fin_sweep_deg": 30,
    "fin_thickness": 2.0,
    "motor_diameter": 18,      # A8/B6/C6
    "motor_length": 70,
}
```

### 2.4 Expected Parts

NoseCone, BodyTube, Fin_1..N (arrayed), CenteringRing_Fore, CenteringRing_Aft, MotorTube, Bulkhead.

---

## 3. Gear Train Grammar

**Source knowledge:** cq_gears (CadQuery), DIN 867, AGMA 2001-D04, ISO 1328

**Design approach:** Mathematical. Geometry is 100% derivable from functional parameters. The involute tooth profile is a pure mathematical curve.

### 3.1 Key Formulas

```python
# Pitch circle diameter
d = module * teeth_count

# Centre distance between meshing gears
centre_distance = module * (z1 + z2) / 2

# Gear ratio
ratio = z2 / z1  # driven / driver

# Addendum (tooth height above pitch circle)
addendum = 1.0 * module

# Dedendum (tooth depth below pitch circle)
dedendum = 1.25 * module

# Tooth thickness at pitch circle
tooth_thickness = math.pi * module / 2

# Base circle (where involute starts)
base_circle_d = d * math.cos(math.radians(pressure_angle))

# Min teeth to avoid undercut
min_teeth = 2 / (math.sin(math.radians(pressure_angle)) ** 2)  # = 17 at 20°
```

### 3.2 Note

Consider using the `cq_gears` library directly: `pip install cq_gears`. It provides `SpurGear(module, teeth_number, width, bore_d)` which handles involute profile generation. The grammar's job is then to compute which gears mesh (from desired ratio) and position them at correct centre distance.

### 3.3 Default Parameters

```python
defaults = {
    "desired_ratio": 3.0,     # output/input
    "module": 1.5,            # mm (tooth size)
    "pressure_angle": 20.0,   # degrees (standard)
    "face_width": 10.0,       # mm
    "driver_teeth": 17,       # minimum for 20° PA
    "bore_diameter": 5.0,     # shaft bore
}
# Derived: driven_teeth = round(driver_teeth * ratio), centre_distance, etc.
```

---

## 4. Furniture/Joinery Grammar

**Source knowledge:** Woodworking standards, FreeCAD Path module, Matthias Wandel plans

**Design approach:** Frame-and-panel construction. Stiles (vertical) + rails (horizontal) + panels. Joinery defines how pieces connect.

### 4.1 Key Rules

```python
# Tenon dimensions
tenon_thickness = stock_thickness / 3
tenon_length = rail_width * 0.67  # 2/3 of receiving piece width
mortise_depth = tenon_length + 2   # slightly deeper for glue

# Shelf span limits (18mm plywood)
max_shelf_span = 900  # mm before visible sag

# Wood movement (cross-grain, per 300mm width)
seasonal_movement = 3 to 5  # mm — must allow for this in panel grooves

# Grain direction: always along longest dimension of each piece
```

### 4.2 Default Parameters (Simple Bookcase)

```python
defaults = {
    "height": 900,
    "width": 600,
    "depth": 250,
    "material_thickness": 18,   # mm plywood
    "shelf_count": 3,
    "back_panel": True,
    "back_thickness": 6,        # mm
    "joinery": "dado",          # "dado" | "biscuit" | "dowel" | "pocket_screw"
}
```

---

## 5. Cross-Domain Patterns

These apply to ALL grammars. The agent should know these when implementing any domain.

**Five CadQuery operations cover every domain:**
1. `extrude()` — 2D sketch → 3D solid (walls, plates, fins)
2. `.cut()` — boolean subtract (openings, bolt holes, ports)
3. revolve / `sweep()` — profile around axis (nose cones, shafts)
4. array (Python loop + Location) — repeat elements (fins, standoffs, teeth)
5. `loft()` — blend profiles (transitions, tapered sections)

**Three-level abstraction (every domain follows this):**
1. Intent → Parameters (AI / user provides)
2. Parameters → Skeleton (pure math in `derive_skeleton()`)
3. Skeleton → Geometry (CadQuery in `build()`)

**Constraint DAG pattern:** Every product is a directed graph where changing one parameter propagates. For now, `derive_skeleton()` implements this as sequential computation. Future: use NetworkX + SymPy for bidirectional constraint solving.
