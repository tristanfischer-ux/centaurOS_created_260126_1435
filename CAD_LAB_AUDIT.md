# CAD Lab Audit: Current State vs. Vertical Farm Standard

**Date**: 2026-02-12
**Auditor**: Claude Code Agent
**Reference**: Vertical Farm Tower v2 + Smartphone Exploded View (user-provided examples)

---

## Executive Summary

**Overall Assessment**: CAD Lab (src/actions/cad-lab.ts) is **already very close** to the vertical farm quality standard. The architecture is sound: interface-first design, component decomposition, local validation, assembly orchestration, and post-execution checks are all present.

**Key Gaps Identified**:
1. ❌ **No connection map** in interface definition (water flow, structural paths)
2. ❌ **Interface prompt doesn't explicitly require sub-component detail** (screw bosses, EMI shields, flex tabs)
3. ❌ **Component prompt doesn't send full interface definition** (just component name/description)
4. ❌ **Component prompt uses negative rules** ("DO NOT USE") instead of positive patterns
5. ❌ **No helper function template** (like `rounded_rect_solid` from smartphone example)
6. ⚠️ **Post-execution validation is hardcoded to DRONE_TARGET** (not dynamic per product)

**Quick Wins**: Gaps 1-5 are prompt improvements only (no code changes needed, just edit the prompts). Gap 6 requires minor refactoring to pass target dimensions through.

---

## Detailed Audit by Phase

### ✅ Phase 0: Research (Lines 476-558)

**Status**: **EXCELLENT** — already matches handover document standard

**What exists**:
- `researchProductSpecs()` function uses Gemini + Google Search grounding
- Prompt explicitly requests: overall dimensions, weight, motor specs, key components, critical constraints, materials, standard parts
- Prompt says "Do NOT guess dimensions. Only include measurements from real sources."
- Falls back to hardcoded reference library if web search fails

**Comparison to vertical farm**:
- ✅ Prevents LLM from inventing dimensions
- ✅ Uses real product specs
- ✅ Has reference library fallback

**Gap**: None. This is excellent as-is.

---

### ⚠️ Phase 1: Interface Definition (Lines 98-143)

**Status**: **GOOD** — has space budget, placement table, validation arithmetic, but missing connection map and sub-component guidance

**What exists**:
```
INTERFACE_SYSTEM_PROMPT includes:
- === SPACE BUDGET === (vertical/horizontal stack, dimensions must sum)
- === COMPONENT PLACEMENT TABLE === (qty, size, position, notes)
- === DERIVED CONSTRAINTS === (target BBox, motor diagonal, arm length)
- === VALIDATION ARITHMETIC === (BBox calc, motor diagonal calc, conflicts check)
- === STRUCTURED DATA (JSON) === (machine-readable component list)
```

**Comparison to vertical farm** (lines 1-96 of reference):
- ✅ Space budget with arithmetic validation
- ❌ **No connection map** (vertical farm has explicit water flow path: Reservoir → Pump → Riser → Headers → Drips → Trays → Gutters → Drain → Reservoir)
- ✅ Component placement table with positions
- ✅ Validation arithmetic (BBox, motor diagonal)
- ❌ **No explicit requirement for sub-component detail** (vertical farm has screw bosses in midframe, EMI shields on PCB, flex tabs on battery, lens barrels in camera)

**Gap 1: Missing connection map**

The vertical farm validates complete flow paths (water loop). The smartphone validates layer stacking order. CAD Lab doesn't prompt for this.

**Fix**: Add to INTERFACE_SYSTEM_PROMPT after COMPONENT PLACEMENT TABLE:

```
=== CONNECTION MAP ===
[For assemblies with flows (water, air, electrical, structural loads), trace complete paths]
Example:
- Water: Reservoir → Pump → Riser → Headers → Drips → Trays → Drains → Return → Reservoir
- Power: Battery → PCB → Components
- Structure: Frame posts → Rails → Cross-braces → Mounting points
```

**Gap 2: No guidance on sub-component detail**

The vertical farm has:
- Screw bosses in the midframe (14 locations)
- LED mounting brackets
- Pump body inside reservoir
- Drain outlets in trays

The smartphone has:
- EMI shields on PCB
- Flex connector tabs on battery
- Lens barrels in camera module
- USB-C connectors on sub PCB
- Speaker grilles, button cutouts

CAD Lab doesn't explicitly ask for this level of detail in the interface definition.

**Fix**: Add to INTERFACE_SYSTEM_PROMPT in the COMPONENT PLACEMENT TABLE section:

```
For each component, include functional sub-features if applicable:
- Screw bosses / mounting points
- Cutouts (ports, buttons, vents)
- Hollow sections (wall thickness)
- Sub-assemblies (shields, connectors, brackets)
```

---

### ⚠️ Phase 2: Component Generation (Lines 150-196)

**Status**: **GOOD** — has template, but doesn't send full interface and uses negative rules

**What exists**:
```
COMPONENT_SYSTEM_PROMPT includes:
- TEMPLATE with cq.Workplane("XY") pattern
- RULES: positioning, fillets, derived dimensions, line limit
- DO NOT USE: .loft(), .sweep(), .mirror(), cq.Compound, etc.
```

**Comparison to vertical farm** (component functions, lines 100-400):
- ✅ Template-based approach
- ❌ **Component doesn't get full interface definition** (only gets component name/description, not adjacent components)
- ❌ **Uses negative rules** ("DO NOT USE") instead of positive patterns
- ❌ **No helper function template** (smartphone example has `rounded_rect_solid` helper)

~~**Gap 3: Component doesn't get full interface**~~ **[CORRECTED: NOT A GAP]**

**Update**: Upon closer inspection of line 885-896, the code DOES send the full interface:
```typescript
const userPrompt = `INTERFACE DEFINITION (full context):
${interfaceText}

GENERATE THIS COMPONENT:
Name: ${component.name}
...`
```

This is exactly what the handover document recommends. **Gap 3 does not exist.**

**Gap 4: Negative rules instead of positive patterns**

Current prompt says:
```
DO NOT USE:
- .loft(), .sweep(), .mirror()
- cq.Compound, cq.Solid, cq.Assembly
- ...
```

From handover document Section 10 "What the System Prompt Should Actually Say":
> "Instead of 13 'NEVER' rules, give the LLM a template"

The vertical farm shows positive patterns:
```python
# Hollow containers
outer = wp.box(100, 50, 30)
inner = wp.workplane(offset=wall).box(100-wall*2, 50-wall*2, 30)
result = outer.cut(inner)

# Pipes
wp.circle(od/2).circle(od/2 - wall).extrude(length)

# Fillets (on simple shape, before union)
part = wp.box(50, 30, 20).edges(">Z").fillet(2)
assembly = assembly.union(part)
```

**Fix**: Replace "DO NOT USE" section with "SAFE PATTERNS (use these)" section showing hollow containers, pipes, fillets, positioning, etc.

**Gap 5: No helper function template**

The smartphone example (lines 132-136) has:
```python
def rounded_rect_solid(wp, w, h, r, thickness):
    """Reusable pattern for rounded rectangles"""
    return wp.sketch().rect(w, h).vertices().fillet(r).finalize().extrude(thickness)
```

This is then used throughout:
```python
display_glass = rounded_rect_solid(
    cq.Workplane("XY").workplane(offset=layer_z['display_glass']),
    device_w - 0.3, device_h - 0.3, corner_r, display_glass_t
)
```

CAD Lab doesn't suggest helper functions for common patterns.

**Fix**: Add to COMPONENT_SYSTEM_PROMPT after the main template:

```
OPTIONAL HELPER FUNCTIONS:
If multiple components share a common pattern (rounded rectangles, hollow cylinders, etc.),
you may define helper functions at the top:

def rounded_rect_solid(wp, w, h, r, t):
    return wp.sketch().rect(w, h).vertices().fillet(r).finalize().extrude(t)

def hollow_cylinder(wp, od, id, h):
    return wp.circle(od/2).circle(id/2).extrude(h)

Then use them in component functions for consistency.
```

---

### ✅ Phase 3: Local Validation (Lines 900-977)

**Status**: **EXCELLENT** — already matches handover document recommendations

**What exists**:
- `validateComponentLocally()` checks:
  1. ✅ Must contain "def make_" function
  2. ✅ Must use `cq.Workplane("XY")`
  3. ✅ Must end with `result = make_...()`
  4. ✅ Hard-banned patterns: cq.Compound, cq.Solid.make, cq.Assembly, .loft(), .sweep(), Workplane("YZ"), Workplane("XZ"), import os, open(), cq.exporters
  5. ✅ Safety net: strips .rotate(), .translate(), .mirror(), .moved() with console.warn logging
  6. ✅ Strips print() statements

**Comparison to handover document** (Section 10 "Local Validation Gate"):
- ✅ All recommended checks are present
- ✅ Safety net logs when it fires (helps diagnose prompt issues)
- ✅ Returns cleaned code

**Gap**: None. This is excellent as-is.

**Minor enhancement opportunity** (not critical):
- Add counter: if safety net strips >3 operations in one session, alert user (mentioned in plan Phase 3)
- This is a "nice to have" but not blocking quality

---

### ✅ Phase N+1: Assembly Generation (Lines 993-1064)

**Status**: **EXCELLENT** — already matches handover document standard

**What exists**:
- `generateAssemblyScript()` gets:
  1. ✅ **Complete validated component functions** (not just signatures)
  2. ✅ Full interface definition text
- ASSEMBLY_SYSTEM_PROMPT rules:
  1. ✅ "Do NOT modify any component function — paste them exactly"
  2. ✅ "Assembly is ONLY .union() and .cut() calls — no new geometry"
  3. ✅ "ALL parameters must be named variables (no magic numbers)"

**Comparison to vertical farm** (assembly section, lines 401-453):
- ✅ Assembly is just function calls and unions
- ✅ No new geometry in assembly
- ✅ Clear progress logging (vertical farm has `add(component, "name")`)

**Gap**: None. This is excellent as-is.

---

### ✅ Phase N+2: Modal Execution (Lines 453-474)

**Status**: **GOOD** — executes correctly, returns STEP/STL/SVG

**What exists**:
- `executeOnModal()` sends complete Python code to Modal worker
- Returns: STEP, STL, SVG (iso, top, front), mass properties, bounding box

**Comparison to vertical farm** (export section, lines 470-500):
- ✅ STEP + STL + SVG exports
- ✅ Multiple views (iso, front, top)
- ❌ **Projection directions not explicit** (vertical farm uses `(1, 0.8, 0.3)` for right-way-up iso)

**Gap 6a: No explicit projection direction control**

The vertical farm specifies:
```python
views = {
    "iso_front": (1, 0.8, 0.3),    # looking slightly upward — feet visible at bottom
    "iso_rear":  (-1, -0.8, 0.3),
    "front":     (0, 1, 0),
    "right":     (1, 0, 0),
    "top":       (0, 0, -1),
}
```

CAD Lab's Modal worker (modal_cad_worker.py) likely has hardcoded projection directions. This should be checked.

**Fix**: Check modal_cad_worker.py to ensure projection directions match handover document Section 4 "Projection direction — CRITICAL".

---

### ⚠️ Phase N+2: Post-Execution Validation (Lines 1066-1107)

**Status**: **GOOD** — checks BBox, fill ratio, STEP size, but hardcoded to drone target

**What exists**:
- `postExecutionValidation()` checks:
  1. ✅ BBox within 10% of target (but uses hardcoded DRONE_TARGET)
  2. ✅ Fill ratio < 15%
  3. ✅ STEP size > 500KB
- Logs warnings but doesn't block (correct approach: "a slightly wrong model is more useful than no model")

**Comparison to vertical farm** (validation section, lines 454-469):
- ✅ BBox checks
- ❌ **Hardcoded to DRONE_TARGET** (vertical farm validates against specific product targets)
- ❌ **No flow path validation** (vertical farm checks "Water loop complete")
- ❌ **No component visibility check** (handover document Section 5b warns about ground-contact features being invisible)

**Gap 6b: Hardcoded validation targets**

Current code (lines 1083-1091):
```typescript
if (bbox.xLen < DRONE_TARGET.minBBoxX || bbox.xLen > DRONE_TARGET.maxBBoxX) {
  warnings.push(`BBox X=${bbox.xLen}mm outside expected ${DRONE_TARGET.minBBoxX}-${DRONE_TARGET.maxBBoxX}mm`)
}
```

This only works for drones. For vertical farms, smartphones, etc., these bounds are wrong.

**Fix**: Pass target dimensions through the call chain and validate dynamically:
```typescript
function postExecutionValidation(
  bbox: { xLen: number; yLen: number; zLen: number } | undefined,
  fillRatio: number | undefined,
  stepSizeKb: number | undefined,
  targetBBox: { x: number; y: number; z: number }, // NEW PARAMETER
): { warnings: string[] } {
  const tolerance = 0.10 // 10%
  if (bbox) {
    if (Math.abs(bbox.xLen - targetBBox.x) / targetBBox.x > tolerance) {
      warnings.push(`BBox X=${bbox.xLen}mm is ${...}% off target ${targetBBox.x}mm`)
    }
    // ... same for Y, Z
  }
  // ...
}
```

---

## Summary of Gaps

| Gap | Severity | Location | Fix Complexity | Status |
|-----|----------|----------|----------------|--------|
| 1. No connection map in interface definition | Medium | INTERFACE_SYSTEM_PROMPT (line 98) | Low (add 5 lines to prompt) | ✅ **FIXED** |
| 2. No sub-component detail guidance | Medium | INTERFACE_SYSTEM_PROMPT (line 108) | Low (add 4 lines to prompt) | ✅ **FIXED** |
| ~~3. Component doesn't get full interface~~ | ~~High~~ | ~~generateSingleComponent()~~ | N/A | ❌ **NOT A GAP** |
| 4. Uses negative rules instead of positive patterns | Medium | COMPONENT_SYSTEM_PROMPT (line 189) | Low (replace "DO NOT USE" section) | ✅ **FIXED** |
| 5. No helper function template | Low | COMPONENT_SYSTEM_PROMPT (line 196) | Low (add helper example) | ✅ **FIXED** |
| 6a. Projection direction not verified | Low | modal_cad_worker.py | Low (check and document) | ⏭️ **NEXT** |
| 6b. Hardcoded validation targets | Medium | postExecutionValidation() (line 1075) | Medium (refactor to pass targets) | ⏭️ **NEXT** |

**Total Estimated Fix Time**: ~~2-4 hours~~ **1-3 hours** (Gaps 1, 2, 4, 5 fixed in Phase 2)

---

## Recommended Fix Order

1. **Gap 3** (Component doesn't get full interface) — High impact, enables better component interfaces
2. **Gap 1** (No connection map) — Enables flow path validation
3. **Gap 2** (No sub-component detail) — Improves output quality (screw bosses, shields, etc.)
4. **Gap 4** (Negative rules → positive patterns) — Makes prompts more robust
5. **Gap 6b** (Hardcoded targets) — Enables validation for non-drone products
6. **Gap 5** (Helper functions) — Nice-to-have for code quality
7. **Gap 6a** (Projection directions) — Verify, likely already correct

---

## Comparison to X-Ray CAD Generator

For context, here's how CAD Lab compares to the legacy X-Ray approach:

| Aspect | X-Ray CAD (cad-generator.ts) | CAD Lab (cad-lab.ts) |
|--------|------------------------------|----------------------|
| Code size per generation | 600-1000 lines monolith | 30-80 lines per component |
| Interface definition | None (direct code gen) | Text-first, validated |
| Local validation | Prompt-based only | AST/regex + safety net |
| Modal calls | 3+ retries typical | 1 final assembly call |
| Error recovery | Entire generation fails | Skip bad component, continue |
| Prompt strategy | "NEVER use X" (13 rules) | Template + examples |
| Research step | None | Google Search + reference library |
| Quality checks | None | BBox, fill ratio, STEP size |

**Conclusion**: CAD Lab is architecturally superior. The gaps identified above are minor prompt refinements, not fundamental design flaws.

---

## Next Steps

1. ✅ **Audit complete** — gaps identified and documented
2. ⏭️ **Phase 2: Enhance prompts** — fix gaps 1-5 (2-4 hours)
3. ⏭️ **Phase 3: Refactor validation** — fix gap 6b (1-2 hours)
4. ⏭️ **Phase 6: Test against real products** — verify quality matches reference examples (2-4 hours)
5. ⏭️ **Phase 5: Deprecate X-Ray** — only after quality verified (2-4 hours)

**Confidence**: High. The architecture is sound, the gaps are small, and the fixes are straightforward.
