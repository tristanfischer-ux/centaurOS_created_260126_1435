# CAD Lab Audit: Gap Analysis vs Vertical Farm Standard

**Date:** 2026-02-12
**Purpose:** Identify gaps between current CAD Lab implementation and the vertical farm "gold standard"

---

## 1. Prompt Comparison

### INTERFACE_SYSTEM_PROMPT (line 98-155)

**Current strengths:**
- ✅ Enforces space budget section
- ✅ Requires component placement table
- ✅ Requires connection map (water/air/electrical/structural)
- ✅ Demands validation arithmetic (BBox calculations)
- ✅ Requires structured JSON output
- ✅ Explicit "DO NOT WRITE ANY CODE" rule

**Gaps vs vertical farm:**
- ⚠️ **Missing**: Examples of good interface definitions (should show vertical farm as template)
- ⚠️ **Missing**: Explicit requirement for sub-component detail in placement table (screw bosses, cutouts, hollow sections currently listed as optional notes, should be mandatory where applicable)
- ⚠️ **Missing**: Requirement to show ALL arithmetic (currently says "show arithmetic" but doesn't enforce step-by-step calculations)
- ⚠️ **Partial**: Connection map examples are good, but should emphasize "complete loop" validation

**Verdict:** GOOD foundation, needs examples and stricter sub-component requirements

---

### COMPONENT_SYSTEM_PROMPT (line 163-244)

**Current strengths:**
- ✅ Template-based approach (shows exact pattern to follow)
- ✅ SAFE PATTERNS section with positive examples
- ✅ Lists AVOID patterns (banned operations)
- ✅ Includes optional helper functions pattern
- ✅ Provides 6 concrete safe patterns (positioning, hollow containers, pipes, fillets, sketches, screw bosses)
- ✅ "Output ONLY the Python code" (prevents explanations)

**Gaps vs vertical farm:**
- ⚠️ **Missing**: Vertical farm reference as quality standard
- ⚠️ **Context issue**: Prompt says "INTERFACE DEFINITION (full context)" in generateSingleComponent (line 888) but doesn't emphasize WHY the full context matters (adjacent components, interface requirements)
- ⚠️ **Missing**: Explicit examples of sub-component detail patterns:
  - EMI shields on PCB (small boxes + fillets)
  - Flex connector tabs (thin extrusions)
  - Lens barrels protruding into body (nested cylinders)
  - Button cutouts (small holes + chamfers)
  - Speaker grille holes (array of small circles)
- ⚠️ **Partial**: Hollow container pattern is good, but should emphasize "containers MUST be hollow, not solid blocks" more strongly

**Verdict:** STRONG template approach, but needs vertical farm reference and more sub-component detail examples

---

### ASSEMBLY_SYSTEM_PROMPT (line 248-278)

**Current strengths:**
- ✅ "Do NOT modify any component function — paste them exactly"
- ✅ "Assembly is ONLY .union() and .cut() calls"
- ✅ "ALL parameters must be named variables"
- ✅ Shows template structure

**Gaps vs vertical farm:**
- ⚠️ **Critical issue**: Prompt says component functions will be pasted (line 266: `{functions}`), which is CORRECT per the plan ("Provide complete function code"), BUT generateAssemblyScript (line 1054-1064) **strips the test lines** and concatenates the functions
  - This is actually GOOD — it gives Gemini the full code
  - The plan says: "Provide **complete function code** (not just signatures)"
  - Current implementation DOES provide complete code (minus test line)
  - ✅ No gap here
- ⚠️ **Missing**: Example of correct assembly from vertical farm:
  ```python
  result = make_body_shell()
  for i, z in enumerate(level_z):
      result = result.union(make_tray(z=z))
  ```
- ⚠️ **Missing**: Emphasis on "positions come from interface definition placement table, not invented"

**Verdict:** CORRECT implementation, but could use vertical farm example for clarity

---

## 2. Local Validation Logic (validateComponentLocally, line 963-1028)

**Current banned patterns (hard failures):**
```typescript
cq.Compound, cq.Solid.make, cq.Assembly,
.loft(, .sweep(,
Workplane("YZ"), Workplane("XZ"),
import os, open(, cq.exporters
```

**Current soft-banned patterns (safety net strips):**
```typescript
.rotate(, .translate(, .mirror(, .moved(
```

**Handover document "Never use these":**
```
.rotate((0,0,0), (0,0,1), 45)  → ✅ covered (.rotate)
.translate((x, y, z))           → ✅ covered (.translate)
.mirror("XY")                   → ✅ covered (.mirror)
cq.Workplane("YZ")              → ✅ covered (Workplane("YZ"))
cq.Compound.makeCompound(...)   → ✅ covered (cq.Compound)
cq.Solid.makeLoft(...)          → ✅ covered (cq.Solid.make)
wp.loft(...)                    → ✅ covered (.loft()
wp.sweep(...)                   → ✅ covered (.sweep()
```

**Positive pattern checks:**
- ✅ Must contain `def make_`
- ✅ Must use `cq.Workplane("XY")`
- ✅ Must end with `result = make_...()`

**Safety net logging:**
- ✅ Logs when stripping banned operations (line 1015)
- ⚠️ **Missing**: Counter for "if safety net fires >3 times, alert user"

**Verdict:** EXCELLENT coverage of banned patterns, needs counter for safety net activations

---

## 3. Research Step (Pass 0)

**Current implementation:**
- ✅ Gemini + Google Search for real-world specs (line 537-577)
- ✅ Thingiverse CAD model search (line 599-659)
- ✅ Claude synthesis for structured report (line 415-455)
- ✅ Hardcoded reference library (DRONE_REFERENCE, line 66-89) as safety net
- ✅ buildReferenceContext merges all sources (line 670-702)

**Does it prevent LLM from inventing dimensions?**
- ✅ Research prompt (line 546-560) says: "Do NOT guess dimensions. Only include measurements you found from real sources."
- ✅ Synthesis prompt (line 1236) says: "Never invent a dimension — mark it as Unknown"
- ✅ Dimensional confidence section: "✅ Confirmed, ⚠️ Approximate, ❓ Unknown"

**Does it use reference libraries for standard parts?**
- ⚠️ Only drone reference hardcoded (DRONE_REFERENCE)
- ⚠️ No smartphone reference, no vertical farm reference
- ⚠️ No library for standard parts (M3 bolts, 5" props, 2020 extrusions, etc.)

**Verdict:** STRONG research pipeline, but hardcoded library is drone-only (needs smartphone, vertical farm, standard parts)

---

## 4. Post-Execution Validation

**Current checks (postExecutionValidation, line 1131-1188):**
- ✅ BBox within 10% of target (dynamic from interface definition OR fallback to DRONE_TARGET)
- ✅ Fill ratio < 15% (real products 2-8%, threshold 15%)
- ✅ STEP file size > 500KB (quality proxy)
- ✅ Logs warnings but doesn't block (line 1183-1185)

**Handover document requirements:**
- ✅ BBox within 10%
- ✅ Fill ratio < 15%
- ✅ STEP size > 500KB

**Missing from handover:**
- ❌ Rendering validation (Section 5d):
  - "After SVG export, render to PNG"
  - "Check ground-contact features are visible"
  - "Check orientation is right-way-up (positive Z = ground at bottom)"
  - "Feet too small to be visible (BBox ratio < 0.05)"
  - "Projection direction looks inverted (negative Z component)"

**Verdict:** Core validation is CORRECT, but rendering validation (PNG checks, visibility, orientation) is NOT IMPLEMENTED

---

## 5. Safety Net Activation Tracking

**Current behavior:**
- ✅ Logs when safety net strips operations (line 1015, 1097)
- ❌ No counter for "if >3 strips in one session, alert user"
- ❌ No session-level tracking

**Implementation needed:**
- Global counter for safety net activations per session
- Alert user if counter > 3 (means prompt is broken)
- Reset counter at start of each generateCadLabModel call

---

## 6. Summary: Critical Gaps

### HIGH PRIORITY (blocks quality improvement)

1. **Missing sub-component detail emphasis in COMPONENT_SYSTEM_PROMPT**
   - Need explicit examples of: EMI shields, flex tabs, lens barrels, button cutouts, speaker grilles, screw bosses
   - Need stronger "containers MUST be hollow" language

2. **Missing rendering validation**
   - No PNG rendering + visibility checks
   - No orientation validation (right-way-up)
   - No ground-contact feature visibility check

3. **Hardcoded reference library is drone-only**
   - Need smartphone reference (7.9mm stack, button cutouts, camera bump)
   - Need vertical farm reference (hollow trays, water loop, LED arrays)
   - Need standard parts library (bolts, props, extrusions, motors)

### MEDIUM PRIORITY (improves quality)

4. **Safety net counter not implemented**
   - Need session-level counter for stripped operations
   - Alert user if >3 strips (prompt debugging signal)

5. **Missing vertical farm example in prompts**
   - INTERFACE_SYSTEM_PROMPT should show vertical farm interface as template
   - COMPONENT_SYSTEM_PROMPT should reference vertical farm component functions
   - ASSEMBLY_SYSTEM_PROMPT should show vertical farm assembly pattern

### LOW PRIORITY (minor improvements)

6. **Interface validation is drone-specific**
   - DRONE_TARGET hardcoded (line 82-90)
   - validateInterfaceDefinition uses DRONE_TARGET for motor diagonal (line 819)
   - Should be product-agnostic or have multiple targets

---

## 7. Quality Standard Comparison

### Vertical Farm Reference Example Features

**Interface definition:**
- ✅ Parameters with arithmetic (level_z calculated from spacing)
- ✅ Derived values, not hardcoded
- 🔄 CAD Lab requires this in interface definition (SPACE BUDGET, VALIDATION ARITHMETIC sections)

**Component functions (30-150 lines):**
- ✅ make_post, make_tray, make_nft_channels, make_led_array, make_reservoir
- ✅ Each returns cq.Workplane, testable in isolation
- 🔄 CAD Lab enforces this via component generation

**Hollow containers:**
- ✅ Trays and reservoir are hollow (not solid blocks)
- ⚠️ Prompt mentions hollow containers but doesn't MANDATE it for container types

**Sub-component detail:**
- ✅ LED mounting brackets, pump body, screw bosses
- ⚠️ Prompt has screw boss example but doesn't emphasize detail level

**Flow path validation:**
- ✅ Water loop traced: Reservoir → Pump → Riser → Headers → Drips → Trays → Gutters → Drain → Reservoir
- 🔄 CAD Lab requires CONNECTION MAP in interface definition

**Assembly orchestration:**
- ✅ Just function calls + unions, no new geometry
- 🔄 CAD Lab enforces "Assembly is ONLY .union() and .cut() calls"

**Export with correct projection:**
- ✅ Multiple views (iso_front, iso_rear, front, right, left, top)
- ✅ Correct projection direction: (1, 0.8, 0.3) for right-way-up iso
- ⚠️ Modal worker generates views, but NO validation that projection is correct

### Smartphone Exploded View Features

**Explosion parameters:**
- ✅ explode_gap, num_layers, layer_z dictionary
- ⚠️ CAD Lab interface definition doesn't have explicit "exploded view" mode

**Helper pattern:**
- ✅ rounded_rect_solid(wp, w, h, r, thickness)
- 🔄 CAD Lab prompt includes "OPTIONAL HELPER FUNCTIONS" section

**Layer detail:**
- ✅ Display panel with Dynamic Island cutout
- ✅ Midframe with 14 screw bosses, USB-C cutout, speaker grille
- ✅ Main PCB with 3 EMI shields
- ⚠️ These patterns exist as examples but aren't enforced in prompt

**Sub-component detail:**
- ✅ EMI shields, screw bosses + holes, lens barrels, flex tabs
- ⚠️ Screw boss pattern is in prompt, but EMI shields, flex tabs, lens barrels are NOT

**Fillets on simple shapes:**
- ✅ Applied before unions, small radius (0.5-1.5mm)
- 🔄 CAD Lab prompt says "Fillets: allowed, but only on THIS component (before union), max 3mm radius"

---

## 8. Acceptance Criteria Status

**From plan Phase 1:**
- ✅ Document lists specific gaps ← THIS DOCUMENT
- ✅ No assumptions — every gap verified by reading actual code ← DONE

**Overall assessment:**
CAD Lab architecture is SOUND. The pipeline structure matches the vertical farm pattern. The main gaps are:
1. Prompt refinement (add vertical farm examples, emphasize sub-component detail)
2. Rendering validation (PNG checks, not implemented)
3. Reference library expansion (smartphone, vertical farm, standard parts)
4. Safety net counter (minor, easy add)

**Recommendation:** Proceed to Phase 2 (Enhance Prompts) immediately. The current foundation is strong enough to build on.
