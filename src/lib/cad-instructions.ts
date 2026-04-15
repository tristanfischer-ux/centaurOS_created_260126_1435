/**
 * @file cad-instructions.ts — CadQuery methodology as a bundled string.
 *
 * @description This file exports the full CLAUDE_CAD_INSTRUCTIONS content
 * as a TypeScript string constant so it gets bundled by webpack and works
 * on Vercel serverless functions (where readFileSync from project root fails).
 *
 * Source of truth: CLAUDE_CAD_INSTRUCTIONS_1214.md in project root.
 * If you update that file, copy the content here too.
 */

export const CAD_INSTRUCTIONS = `# CLAUDE.md — CadQuery Parametric CAD Pipeline

## For: Claude Code (Opus 4.6)
## Project: ForgeOS The Forge at https://fractionalforge.app/the-forge/cad-lab
## Stack: CadQuery + Python, executed server-side, results displayed at the URL above

---

## What This Document Is

This is battle-tested methodology from building 8 working parametric CAD models: racing drone, smartphone, exploded assembly drawing, vertical farming tower (×2), Nespresso capsule reloader, and industrial brine processing system. Every rule here was learned by failing first and fixing second. Follow it exactly and you will produce correct geometry on the first attempt.

The output files (STEP, STL, PNG renders) should be generated server-side and made available for viewing/download at https://fractionalforge.app/the-forge/cad-lab.

---

## THE PROCESS (do this in order, every time)

### Step 1: RESEARCH real dimensions

Before anything else, search for real-world reference dimensions of the product you're building. Never invent dimensions — they will be wrong.

**What to search for:**
- Physical dimensions of key components (mm)
- Standard sizes, gauges, diameters
- Interface dimensions (bolt patterns, pipe sizes, slot widths)

**Example — Nespresso capsule (these are real, verified):**
\`\`\`
Top outer diameter: 37mm (flange)
Top inner diameter: 30mm
Base diameter: 24mm
Height: 29mm (body 27mm + flange 2mm)
\`\`\`

**Example — Brine system vessels (from industrial specs):**
\`\`\`
Pre-treatment tank: Ø1200 × 1800mm cylinder + 500mm cone
Evaporator: Ø900 × 2400mm
Crystallizer: Ø1000 × 3000mm with Ø500 draft tube
\`\`\`

**Example — Large structural systems (critical: preserve full scale):**
\`\`\`
20ft shipping container: 6058 × 2438 × 2591mm
40ft shipping container: 12192 × 2438 × 2591mm
Standard building door: 2030 × 813 × 44mm
Warehouse bay: 7320 × 12200 × 8500mm (height to beam)
Vehicle chassis: 4500 × 1800 × 300mm steel frame
\`\`\`

**SCALE PRESERVATION CRITICAL:** Always model large systems at their REAL scale. A shipping container CAD model should have dimensions ~6000×2400×2600mm and mass ~2000kg, not 200×150×100mm and 500g.

If you can't find exact specs, use reasonable engineering estimates and document them.

### Step 2: Write the INTERFACE DEFINITION (text only — no code yet)

This is the most important step. It is NOT optional. Every model that failed skipped this. Every model that worked did this first.

The interface definition is a plain text document with four sections:

#### a) Space Budget
How components stack/fit within the overall envelope. Must add up arithmetically.

\`\`\`
Example — Vertical farm level spacing:
Tray depth:      60mm
Growing zone:   300mm
Clearance:       40mm
LED bar:         34mm
LED bracket:     16mm
Plumbing zone:   50mm
─────────────────────
Total per level: 500mm  ← must match before you write any code
\`\`\`

\`\`\`
Example — Shipping container structure (large scale):
Floor thickness:       100mm
Cargo space height:   2390mm
Ceiling panel:         20mm
Roof structure:        80mm
─────────────────────────────
Total internal height: 2590mm  ← ISO standard height
\`\`\`

**Rule: if the numbers don't add up in text, they won't add up in 3D.**

#### b) Component Placement Table
Flat table. Every component. Quantity, dimensions, position.

\`\`\`
| Component        | Qty | Dimensions (mm)     | Position (x,y,z)  | Material   | Source         | Notes              |
|------------------|-----|---------------------|--------------------|-----------:|----------------|--------------------|
| Magazine tube    | 1   | Ø45 OD × 315 tall  | (0, 0, 70)        | PLA        | CUSTOM         | ID=39mm            |
| Gate housing     | 1   | 65×65×22            | (0, 0, 50)        | PLA        | CUSTOM         | Spring pockets     |
| Capsule          | 10  | Ø37 × 29           | (0, 0, 70+29*i)   | aluminium  | CUSTOM         | Stacked in tube    |
\`\`\`

This table becomes your build checklist. Cross off each component as you model it.

#### c) Connection Map (for systems with flow)
Trace every flow path end-to-end. If it doesn't connect in text, it won't connect in geometry.

\`\`\`
RO Brine In → Pre-Treatment Tank → Evaporator → Crystallizer →
Hydrocyclone → Filter Press → Salt Bin
                                    ↑
                            Condensate Return
\`\`\`

#### d) Validation Checklist
Boolean checks. All must pass before you write geometry.

\`\`\`
- [ ] Magazine ID (39mm) > capsule flange (37mm) — clearance
- [ ] 10 capsules × 29mm = 290mm < tube height 315mm — fits
- [ ] Gate below tube, chute below gate — correct order
- [ ] Total height < 500mm — reasonable
\`\`\`

### Step 3: Write the CadQuery code

Now — and only now — write geometry. Follow these code rules exactly.

---

## CODE ARCHITECTURE RULES

### Rule 1: Every component is a function

\`\`\`python
def make_magazine_tube():
    """Vertical tube that holds the capsule stack"""
    # ... geometry ...
    return tube

def make_gate_housing():
    """Housing for the spring-loaded gate blades"""
    # ... geometry ...
    return housing
\`\`\`

Never write monolithic sequential geometry. If you can't test a component alone, you can't debug it.

### Rule 2: Parameters at the top, derived values calculated

\`\`\`python
# PRIMARY PARAMETERS (from interface definition)
num_capsules = 10
cap_h = 29.0
tube_wall = 3.0
tube_id = 39.0

# DERIVED — always calculated, never hardcoded
tube_od = tube_id + tube_wall * 2        # = 45mm
tube_height = num_capsules * cap_h + 25   # = 315mm
total_height = tube_z + tube_height + 5   # changes if anything above changes
\`\`\`

**The #1 bug source in every failed model was a hardcoded derived value.** If changing parameter X should change value Y, then Y must be calculated from X. No exceptions.

### Rule 3: Assembly is just function calls + union

\`\`\`python
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
\`\`\`

### Rule 4: Validation checks before export

\`\`\`python
checks = [
    ("Tube ID > capsule flange", tube_id > cap_top_od),
    ("Stack fits in tube", num_capsules * cap_h < tube_height),
    ("Total height reasonable", total_height < 500),
]
for name, ok in checks:
    print(f"  {'✓' if ok else '✗'} {name}")
\`\`\`

---

## CADQUERY PATTERNS THAT WORK

### Positioning a component at (x, y, z)
\`\`\`python
cq.Workplane("XY")
    .workplane(offset=z)          # move up to Z height
    .transformed(offset=(x, y, 0)) # then translate in XY
    .circle(r).extrude(h)         # then build geometry
\`\`\`

This is THE positioning pattern. Use it everywhere. Don't use \`.translate()\` or \`.move()\`.

### Hollow cylinder (pipe, vessel)
\`\`\`python
outer = cq.Workplane("XY").workplane(offset=z).transformed(offset=(x,y,0)).circle(od/2).extrude(h)
inner = cq.Workplane("XY").workplane(offset=z+wall).transformed(offset=(x,y,0)).circle(id/2).extrude(h - wall*2)
vessel = outer.cut(inner)
\`\`\`

### Hollow box (bin, housing)
\`\`\`python
outer = wp.box(w, d, h)
inner = wp.transformed(offset=(0, 0, wall)).box(w - wall*2, d - wall*2, h)
box = outer.cut(inner)
\`\`\`

### Conical section (funnel, hydrocyclone, vessel bottom)
\`\`\`python
cone = (
    cq.Workplane("XY")
    .workplane(offset=z_bottom)
    .transformed(offset=(x, y, 0))
    .circle(bottom_radius)
    .workplane(offset=height)
    .circle(top_radius)
    .loft()
)
\`\`\`

### Horizontal cylinder (heat exchanger, tank on its side)
\`\`\`python
cq.Workplane("XY")
    .workplane(offset=z)
    .transformed(offset=(x, y, 0))
    .transformed(rotate=(0, 90, 0))    # tip it horizontal
    .circle(radius)
    .extrude(length)
\`\`\`

### Orientation WITHOUT .rotate()
\`\`\`python
# To rotate a shape, use .transformed(rotate=(...)) BEFORE building geometry
cq.Workplane("XY")
    .transformed(rotate=(0, 0, 45))   # rotate 45° around Z
    .box(50, 30, 20)
\`\`\`

### Fillets — BEFORE union, on simple geometry only
\`\`\`python
part = wp.box(50, 30, 20).edges(">Z").fillet(2)
# Then union
assembly = assembly.union(part)
\`\`\`

Never fillet after union. Never fillet complex intersections. Maximum 3mm on simple rectangular edges.

### Rounded rectangle (sketch API)
\`\`\`python
cq.Workplane("XY")
    .sketch()
    .rect(width, depth)
    .vertices().fillet(radius)
    .finalize()
    .extrude(height)
\`\`\`

---

## OPERATIONS TO AVOID

These crash CadQuery or produce broken geometry:

| Operation | Why it fails | Use instead |
|-----------|-------------|-------------|
| \`.rotate()\` | Breaks workplane chain, geometry flies off | \`.transformed(rotate=(...))\` before geometry |
| \`.translate()\` | Same issue | \`.transformed(offset=(...))\` or \`.workplane(offset=z)\` |
| \`.mirror()\` | Inconsistent results | Build both sides explicitly |
| \`.loft()\` with >2 sections | Crashes | Only 2 sections (bottom circle → top circle) |
| \`.sweep()\` | Fragile, crashes on complex paths | Use \`.extrude()\` + positioning |
| \`cq.Compound\` / \`cq.Solid\` | Low-level API, error-prone | Stay with \`Workplane\` API |
| \`.fillet()\` after \`.union()\` | Fails on complex edge intersections | Fillet individual parts before union |
| \`Workplane("YZ")\` or \`("XZ")\` | Confusing coordinate system | Always start \`"XY"\` + use \`.transformed(rotate=...)\` |

---

## COMMON MISTAKES AND FIXES

### 1. "My feet/base are invisible"
**Cause:** Viewing angle too steep (high Z component looks straight down), or feet too small relative to the model, or boolean union absorbed small features.

**Fix:** Use viewing angle \`(1, 0.8, 0.3)\` — low angle shows the underside. Make feet/pads visibly larger (at least 1/10th of the overall model width). Add a visible gap (e.g. \`foot_lift = 60mm\`) between the base and the ground plane.

### 2. "The model is upside down"
**Cause:** Negative Z component in projection direction.

**Fix:** Flip the Z component to positive. \`(1, 0.8, 0.3)\` not \`(1, 0.8, -0.3)\`.

### 3. "The top is floating / disconnected"
**Cause:** A hardcoded height value didn't update when you changed a base parameter.

**Fix:** Make ALL heights derived from primary parameters:
\`\`\`python
post_height = top_z - foot_lift  # derived, not hardcoded
\`\`\`

### 4. "Geometry crashed with Standard_DomainError"
**Cause:** A dimension computed to zero or negative (e.g. leg height when cone bottom is below skid top).

**Fix:** Add \`max()\` guards:
\`\`\`python
leg_ht = max(leg_top - leg_bot, 10)  # never zero
\`\`\`

### 5. "Loft/sweep crashed"
**Cause:** Complex paths or >2 sections.

**Fix:** Only use \`.loft()\` with exactly 2 sections (bottom and top profiles). For complex shapes, build from simple primitives with \`.union()\` and \`.cut()\`.

### 6. "Component flew off to the wrong position"
**Cause:** Used \`.translate()\` or \`.rotate()\` which doesn't work reliably in chains.

**Fix:** Always use \`.workplane(offset=z).transformed(offset=(x, y, 0))\` for positioning.

---

## CRITICAL ANTI-PATTERNS (hallucination traps)

These are the #1 source of first-attempt failures. Check your code against every one.

### Anti-pattern 1: Hardcoded derived values
\`\`\`python
# BAD — breaks when capsule_count changes
tube_height = 315

# GOOD — always recomputes
tube_height = capsule_count * cap_h + (capsule_count - 1) * gap + margin
\`\`\`
If a value SHOULD change when a parameter changes, it MUST be an expression.

### Anti-pattern 2: Z-stack height doubling
\`\`\`python
# BAD — wall_h is counted in BOTH the .extrude() AND the next offset
wall = wp.box(w, d, wall_h)
roof = cq.Workplane("XY").workplane(offset=base_h + wall_h + wall_h).box(w, d, roof_h)

# GOOD — each height used exactly once in the Z chain
wall = wp.box(w, d, wall_h)
roof = cq.Workplane("XY").workplane(offset=base_h + wall_h).box(w, d, roof_h)
\`\`\`
Trace every Z offset back to the space budget. Each height must appear exactly once.

### Anti-pattern 3: Defined but never called
\`\`\`python
# BAD — function exists but is never added to assembly
def make_handle():
    return cq.Workplane("XY").box(20, 5, 40)

result = make_body().union(make_cap())  # handle missing!

# GOOD — every make_*() is called and union'd
result = make_body().union(make_cap()).union(make_handle())
\`\`\`
Cross-check: every \`def make_*()\` must appear as a call in the assembly section.

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
`
