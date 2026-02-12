# CLAUDE.md — CadQuery Parametric CAD Pipeline

## For: Claude Code (Opus 4.6)
## Project: ForgeOS CAD Lab at https://centauros.io/the-forge/cad-lab
## Stack: CadQuery + Python, executed server-side, results displayed at the URL above

---

## What This Document Is

This is battle-tested methodology from building 8 working parametric CAD models: racing drone, smartphone, exploded assembly drawing, vertical farming tower (×2), Nespresso capsule reloader, and industrial brine processing system. Every rule here was learned by failing first and fixing second. Follow it exactly and you will produce correct geometry on the first attempt.

The output files (STEP, STL, PNG renders) should be generated server-side and made available for viewing/download at https://centauros.io/the-forge/cad-lab.

---

## THE PROCESS (do this in order, every time)

### Step 1: RESEARCH real dimensions

Before anything else, search for real-world reference dimensions of the product you're building. Never invent dimensions — they will be wrong.

**What to search for:**
- Physical dimensions of key components (mm)
- Standard sizes, gauges, diameters
- Interface dimensions (bolt patterns, pipe sizes, slot widths)

**Example — Nespresso capsule (these are real, verified):**
```
Top outer diameter: 37mm (flange)
Top inner diameter: 30mm
Base diameter: 24mm
Height: 29mm (body 27mm + flange 2mm)
```

**Example — Brine system vessels (from industrial specs):**
```
Pre-treatment tank: Ø1200 × 1800mm cylinder + 500mm cone
Evaporator: Ø900 × 2400mm
Crystallizer: Ø1000 × 3000mm with Ø500 draft tube
```

If you can't find exact specs, use reasonable engineering estimates and document them.

### Step 2: Write the INTERFACE DEFINITION (text only — no code yet)

This is the most important step. It is NOT optional. Every model that failed skipped this. Every model that worked did this first.

The interface definition is a plain text document with four sections:

#### a) Space Budget
How components stack/fit within the overall envelope. Must add up arithmetically.

```
Example — Vertical farm level spacing:
Tray depth:      60mm
Growing zone:   300mm
Clearance:       40mm
LED bar:         34mm
LED bracket:     16mm
Plumbing zone:   50mm
─────────────────────
Total per level: 500mm  ← must match before you write any code
```

**Rule: if the numbers don't add up in text, they won't add up in 3D.**

#### b) Component Placement Table
Flat table. Every component. Quantity, dimensions, position.

```
| Component        | Qty | Dimensions (mm)     | Position (x,y,z)  | Notes              |
|------------------|-----|---------------------|--------------------|--------------------|
| Magazine tube    | 1   | Ø45 OD × 315 tall  | (0, 0, 70)        | ID=39mm            |
| Gate housing     | 1   | 65×65×22            | (0, 0, 50)        | Spring pockets     |
| Capsule          | 10  | Ø37 × 29           | (0, 0, 70+29*i)   | Stacked in tube    |
```

This table becomes your build checklist. Cross off each component as you model it.

#### c) Connection Map (for systems with flow)
Trace every flow path end-to-end. If it doesn't connect in text, it won't connect in geometry.

```
RO Brine In → Pre-Treatment Tank → Evaporator → Crystallizer →
Hydrocyclone → Filter Press → Salt Bin
                                    ↑
                            Condensate Return
```

#### d) Validation Checklist
Boolean checks. All must pass before you write geometry.

```
- [ ] Magazine ID (39mm) > capsule flange (37mm) — clearance
- [ ] 10 capsules × 29mm = 290mm < tube height 315mm — fits
- [ ] Gate below tube, chute below gate — correct order
- [ ] Total height < 500mm — reasonable
```

### Step 3: Write the CadQuery code

Now — and only now — write geometry. Follow these code rules exactly.

---

## CODE ARCHITECTURE RULES

### Rule 1: Every component is a function

```python
def make_magazine_tube():
    """Vertical tube that holds the capsule stack"""
    # ... geometry ...
    return tube

def make_gate_housing():
    """Housing for the spring-loaded gate blades"""
    # ... geometry ...
    return housing
```

Never write monolithic sequential geometry. If you can't test a component alone, you can't debug it.

### Rule 2: Parameters at the top, derived values calculated

```python
# PRIMARY PARAMETERS (from interface definition)
num_capsules = 10
cap_h = 29.0
tube_wall = 3.0
tube_id = 39.0

# DERIVED — always calculated, never hardcoded
tube_od = tube_id + tube_wall * 2        # = 45mm
tube_height = num_capsules * cap_h + 25   # = 315mm
total_height = tube_z + tube_height + 5   # changes if anything above changes
```

**The #1 bug source in every failed model was a hardcoded derived value.** If changing parameter X should change value Y, then Y must be calculated from X. No exceptions.

### Rule 3: Assembly is just function calls + union

```python
assy = None

def add(part, name):
    global assy
    if part is None:
        return
    assy = part if assy is None else assy.union(part)
    print(f"  + {name}")

# Build
add(make_skid_frame(), "Skid frame")
add(make_vessel(pt_x, pt_y, pt_d, pt_h), "Pre-treatment tank")
add(make_pump(evap_x, evap_y - 500), "Evaporator circ pump")
# ... etc
```

### Rule 4: Validation checks before export

```python
checks = [
    ("Tube ID > capsule flange", tube_id > cap_top_od),
    ("Stack fits in tube", num_capsules * cap_h < tube_height),
    ("Total height reasonable", total_height < 500),
]
for name, ok in checks:
    print(f"  {'✓' if ok else '✗'} {name}")
```

---

## CADQUERY PATTERNS THAT WORK

### Positioning a component at (x, y, z)
```python
cq.Workplane("XY")
    .workplane(offset=z)          # move up to Z height
    .transformed(offset=(x, y, 0)) # then translate in XY
    .circle(r).extrude(h)         # then build geometry
```

This is THE positioning pattern. Use it everywhere. Don't use `.translate()` or `.move()`.

### Hollow cylinder (pipe, vessel)
```python
outer = cq.Workplane("XY").workplane(offset=z).transformed(offset=(x,y,0)).circle(od/2).extrude(h)
inner = cq.Workplane("XY").workplane(offset=z+wall).transformed(offset=(x,y,0)).circle(id/2).extrude(h - wall*2)
vessel = outer.cut(inner)
```

### Hollow box (bin, housing)
```python
outer = wp.box(w, d, h)
inner = wp.transformed(offset=(0, 0, wall)).box(w - wall*2, d - wall*2, h)
box = outer.cut(inner)
```

### Conical section (funnel, hydrocyclone, vessel bottom)
```python
cone = (
    cq.Workplane("XY")
    .workplane(offset=z_bottom)
    .transformed(offset=(x, y, 0))
    .circle(bottom_radius)
    .workplane(offset=height)
    .circle(top_radius)
    .loft()
)
```

### Horizontal cylinder (heat exchanger, tank on its side)
```python
cq.Workplane("XY")
    .workplane(offset=z)
    .transformed(offset=(x, y, 0))
    .transformed(rotate=(0, 90, 0))    # tip it horizontal
    .circle(radius)
    .extrude(length)
```

### Orientation WITHOUT .rotate()
```python
# To rotate a shape, use .transformed(rotate=(...)) BEFORE building geometry
cq.Workplane("XY")
    .transformed(rotate=(0, 0, 45))   # rotate 45° around Z
    .box(50, 30, 20)
```

### Fillets — BEFORE union, on simple geometry only
```python
part = wp.box(50, 30, 20).edges(">Z").fillet(2)
# Then union
assembly = assembly.union(part)
```

Never fillet after union. Never fillet complex intersections. Maximum 3mm on simple rectangular edges.

### Rounded rectangle (sketch API)
```python
cq.Workplane("XY")
    .sketch()
    .rect(width, depth)
    .vertices().fillet(radius)
    .finalize()
    .extrude(height)
```

---

## OPERATIONS TO AVOID

These crash CadQuery or produce broken geometry:

| Operation | Why it fails | Use instead |
|-----------|-------------|-------------|
| `.rotate()` | Breaks workplane chain, geometry flies off | `.transformed(rotate=(...))` before geometry |
| `.translate()` | Same issue | `.transformed(offset=(...))` or `.workplane(offset=z)` |
| `.mirror()` | Inconsistent results | Build both sides explicitly |
| `.loft()` with >2 sections | Crashes | Only 2 sections (bottom circle → top circle) |
| `.sweep()` | Fragile, crashes on complex paths | Use `.extrude()` + positioning |
| `cq.Compound` / `cq.Solid` | Low-level API, error-prone | Stay with `Workplane` API |
| `.fillet()` after `.union()` | Fails on complex edge intersections | Fillet individual parts before union |
| `Workplane("YZ")` or `("XZ")` | Confusing coordinate system | Always start `"XY"` + use `.transformed(rotate=...)` |

---

## EXPORT AND RENDERING

### Export STEP + STL
```python
cq.exporters.export(assembly, "model.step")
cq.exporters.export(assembly, "model.stl")
```

### Export SVG wireframe views
```python
views = {
    "iso_front": (1, 0.8, 0.3),     # standard isometric, slightly upward
    "iso_rear":  (-1, -0.8, 0.3),   # rear view
    "top":       (0, 0, -1),         # plan view (looking down)
    "front":     (0, 1, 0),          # front elevation
    "right":     (1, 0, 0),          # right elevation
}

for name, direction in views.items():
    cq.exporters.export(assembly, f"{name}.svg", opt={
        "projectionDir": direction,
        "showHidden": False,
        "strokeWidth": 0.3,
        "width": 1600,
        "height": 1000,
    })
```

### CRITICAL: Projection direction rules
- **Positive Z component = right-way-up** (ground at bottom, sky at top)
- **Negative Z component = upside-down** (common mistake, renders model inverted)
- `(1, 0.8, 0.3)` is the standard "good" isometric — slightly above eye level, shows both top and front
- `(1, 0.8, -0.3)` would be INVERTED — don't use negative Z

### Convert SVG to PNG
```python
import cairosvg
cairosvg.svg2png(url="view.svg", write_to="view.png",
                 output_width=2000, output_height=1600,
                 background_color='white')
```

### ALWAYS verify renders visually
After generating images, look at them. Check:
- Is the model right-way-up? (positive Z in projection direction)
- Are all components visible? (not occluded by viewing angle)
- Do supports/legs show? (use low viewing angle: Z ≈ 0.3, not 0.7)
- Does the overall shape match what you intended?

If something looks wrong, fix it and re-render. Don't deliver unverified renders.

---

## COMMON MISTAKES AND FIXES

### 1. "My feet/base are invisible"
**Cause:** Viewing angle too steep (high Z component looks straight down), or feet too small relative to the model, or boolean union absorbed small features.

**Fix:** Use viewing angle `(1, 0.8, 0.3)` — low angle shows the underside. Make feet/pads visibly larger (at least 1/10th of the overall model width). Add a visible gap (e.g. `foot_lift = 60mm`) between the base and the ground plane.

### 2. "The model is upside down"
**Cause:** Negative Z component in projection direction.

**Fix:** Flip the Z component to positive. `(1, 0.8, 0.3)` not `(1, 0.8, -0.3)`.

### 3. "The top is floating / disconnected"
**Cause:** A hardcoded height value didn't update when you changed a base parameter.

**Fix:** Make ALL heights derived from primary parameters:
```python
post_height = top_z - foot_lift  # derived, not hardcoded
```

### 4. "Geometry crashed with Standard_DomainError"
**Cause:** A dimension computed to zero or negative (e.g. leg height when cone bottom is below skid top).

**Fix:** Add `max()` guards:
```python
leg_ht = max(leg_top - leg_bot, 10)  # never zero
```

### 5. "Loft/sweep crashed"
**Cause:** Complex paths or >2 sections.

**Fix:** Only use `.loft()` with exactly 2 sections (bottom and top profiles). For complex shapes, build from simple primitives with `.union()` and `.cut()`.

### 6. "Component flew off to the wrong position"
**Cause:** Used `.translate()` or `.rotate()` which doesn't work reliably in chains.

**Fix:** Always use `.workplane(offset=z).transformed(offset=(x, y, 0))` for positioning.

---

## TOOLING — Exact Versions and Dependencies

### System requirements
- **OS:** Ubuntu 24.04 LTS (x86_64)
- **Python:** 3.12
- **System libraries required for rendering:**
  - `libcairo2-dev` (Cairo 2D graphics — needed by CairoSVG)
  - `libpango-1.0-0`, `libpangocairo-1.0-0` (text rendering)
  - `libgdk-pixbuf-2.0-0` (image format support)

```bash
# System deps (if not already present)
apt-get update && apt-get install -y libcairo2-dev libpango1.0-dev libgdk-pixbuf2.0-dev
```

### Python packages — exact versions that work together

```bash
# Core CAD engine (this is the heart of everything)
pip install cadquery==2.4.0 --break-system-packages

# cadquery-ocp==7.7.2 is installed automatically as a dependency
# This is the OpenCascade kernel that does all the real geometry work

# SVG → PNG rendering pipeline
pip install CairoSVG==2.8.2 --break-system-packages

# Optional: mesh analysis for STL validation
pip install trimesh numpy --break-system-packages
```

### What each tool does in the pipeline

| Tool | Version | Role | Used for |
|------|---------|------|----------|
| `cadquery` | 2.4.0 | Parametric CAD kernel | All geometry creation, boolean operations, export |
| `cadquery-ocp` | 7.7.2 | OpenCascade Python bindings | Underlying geometry engine (auto-installed with cadquery) |
| `CairoSVG` | 2.8.2 | SVG to PNG rasteriser | Converting CadQuery SVG wireframe exports to PNG images |
| `numpy` | 1.26.4 | Numerical computing | Array math, used by trimesh and some CadQuery internals |
| `scipy` | 1.17.0 | Scientific computing | Optional — advanced mesh/geometry analysis |
| `math` | stdlib | Trigonometry | `sin`, `cos`, `radians` for positioning components in circles |

### The rendering pipeline (this is how images are generated)

CadQuery cannot directly export PNG or raster images. The pipeline is:

```
CadQuery geometry → .export("file.svg")  →  CairoSVG  →  file.png
     (3D model)      (2D wireframe SVG)    (rasterise)   (viewable image)
```

**Step 1: CadQuery exports SVG wireframe projection**
```python
cq.exporters.export(assembly, "view.svg", opt={
    "projectionDir": (1, 0.8, 0.3),   # camera direction vector
    "showHidden": False,                # hide backfaces
    "strokeWidth": 0.3,                 # line thickness
    "width": 1600,                      # SVG canvas width
    "height": 1000,                     # SVG canvas height
})
```

This produces a 2D line drawing (wireframe) — no shading, no colours, equal line weights. Think of it as an engineering drawing projection.

**Step 2: CairoSVG converts to PNG**
```python
import cairosvg
cairosvg.svg2png(
    url="view.svg",
    write_to="view.png",
    output_width=2000,       # raster width in pixels
    output_height=1600,      # raster height in pixels
    background_color='white' # white background (SVG default is transparent)
)
```

**Key limitation:** The output is always wireframe line art — no shaded/solid renders. For photorealistic or shaded renders, the STEP file must be opened in a 3D viewer (FreeCAD, CAD Exchanger, Three.js, etc). The PNG renders are for quick verification and thumbnail display.

### CadQuery export formats available

| Format | Function | Use case |
|--------|----------|----------|
| STEP (.step) | `cq.exporters.export(shape, "file.step")` | Primary engineering format, parametric, import to any CAD |
| STL (.stl) | `cq.exporters.export(shape, "file.stl")` | 3D printing, web 3D viewers (Three.js), mesh analysis |
| SVG (.svg) | `cq.exporters.export(shape, "file.svg", opt={...})` | 2D wireframe projection, converted to PNG for display |
| DXF (.dxf) | `cq.exporters.exportDXF(shape, "file.dxf")` | 2D drawings for laser cutting / CNC |
| AMF (.amf) | via AmfWriter | Additive manufacturing format |
| 3MF (.3mf) | via ThreeMFWriter | Modern 3D printing format |
| VRML (.wrl) | via VrmlAPI | Web 3D (legacy) |
| VTK (.vtp) | `cq.exporters.exportVTP(shape, "file.vtp")` | Scientific visualisation |

For the CAD Lab, generate **STEP + STL + PNG** minimum. STEP for engineering, STL for web 3D display, PNG for thumbnails/gallery.

### Verification script (run this first to confirm everything works)

```python
#!/usr/bin/env python3
"""Verify CadQuery toolchain is working."""
import cadquery as cq
print(f"cadquery {cq.__version__}")

import OCP
print(f"OCP (OpenCascade) OK")

# Test geometry
box = cq.Workplane("XY").box(10, 10, 10)
cq.exporters.export(box, "/tmp/test.step")
cq.exporters.export(box, "/tmp/test.stl")
cq.exporters.export(box, "/tmp/test.svg", opt={
    "projectionDir": (1, 0.8, 0.3),
    "showHidden": False,
})
print("STEP/STL/SVG export OK")

import cairosvg
cairosvg.svg2png(url="/tmp/test.svg", write_to="/tmp/test.png",
                 output_width=800, output_height=600, background_color='white')
print("PNG rendering OK")

import os
for f in ['test.step', 'test.stl', 'test.svg', 'test.png']:
    size = os.path.getsize(f'/tmp/{f}')
    print(f"  {f}: {size} bytes")

print("\n✓ All tools working. Ready to build models.")
```

---

## COMPLETE WORKFLOW EXAMPLE

Here is the exact sequence for building any model. This is what actually works.

### 1. User says: "Build me a Nespresso capsule auto-reloader"

### 2. You search for real dimensions:
```
Nespresso Original capsule: Ø37mm flange, Ø24mm base, 29mm height
```

### 3. You write the interface definition (text, no code):
```
Space Budget:
  Magazine cap:        5mm
  Capsule stack (×10): 290mm
  Gate mechanism:      22mm
  Chute/funnel:        35mm
  Mounting bracket:    12mm
  ─────────────────────────
  Total height:       ~389mm

Component Placement Table:
  | Component     | Dimensions      | Position      |
  | Tube          | Ø45 × 315mm    | (0, 0, 69)    |
  | Gate housing  | 65×65×22        | (0, 0, 47)    |
  | Chute         | Ø39→Ø30 × 35   | (0, 0, 12)    |
  | Bracket       | 110×85×12       | (0, 0, 0)     |

Validation:
  ✓ Tube ID (39) > capsule (37) — 2mm clearance
  ✓ 10 × 29 = 290 < 315 tube height
  ✓ Total < 500mm
```

### 4. You write the code following all rules above

### 5. You run it, export STEP + STL + PNG renders

### 6. You verify renders visually — fix any issues

### 7. You deliver files to https://centauros.io/the-forge/cad-lab

---

## DELIVERY — CAD Lab Integration

All generated files should be made available at **https://centauros.io/the-forge/cad-lab**.

### Files to generate for each model:
1. `{model_name}.step` — parametric CAD file (for CAD viewers, downstream engineering)
2. `{model_name}.stl` — mesh file (for 3D printing, web 3D viewers)
3. `{model_name}.py` — the Python source code (reproducible, editable)
4. `{model_name}_iso_front.png` — primary isometric render
5. `{model_name}_iso_rear.png` — rear isometric render
6. `{model_name}_top.png` — plan view (for layout-heavy models like the brine system)

### File naming convention:
- Snake_case, lowercase
- Descriptive: `brine_system.step`, `nespresso_reloader.stl`, `vertical_farm.py`
- Views: `{model}_iso_front.png`, `{model}_iso_rear.png`, `{model}_top.png`, `{model}_front.png`

### What to display on the CAD Lab page:
- Primary isometric PNG render (hero image)
- Model specification summary (dimensions, component count, key features)
- Download links for STEP, STL, and source .py files
- Additional view renders (rear, top, front) in a gallery or secondary panel

---

## REFERENCE: Validated Working Models

These models were built using this exact process and all produced correct geometry:

| Model | Components | Dimensions | Key Features |
|-------|-----------|------------|-------------|
| Racing drone v3 | 15+ | 302mm diagonal | Motor mounts, arm tubes, electronics stack |
| Smartphone | 12 | 147×71×7.9mm | Z-stack validated, camera module, buttons |
| Vertical farm v2 | 20+ | 1100×1100×2460mm | 4 grow levels, water loop, LED arrays |
| Nespresso reloader | 18 | Ø45×389mm | Magazine, gate mechanism, sight windows |
| Brine system | 20+ | 6000×2400×3500mm | 5-stage process, vessels, heat exchangers, hydrocyclone |

---

## FINAL CHECKLIST — Before delivering any model

- [ ] Interface definition written BEFORE code
- [ ] All dimensions from real-world research (not invented)
- [ ] Space budget adds up arithmetically
- [ ] Every component is a function
- [ ] All derived values calculated from primary parameters (no hardcoded magic numbers)
- [ ] Validation checks all pass
- [ ] STEP file exports without error
- [ ] STL file exports without error
- [ ] PNG renders are right-way-up (positive Z in projection direction)
- [ ] PNG renders show all key features (low viewing angle, correct orientation)
- [ ] Renders visually verified — model looks like what was requested
- [ ] Files delivered to https://centauros.io/the-forge/cad-lab
