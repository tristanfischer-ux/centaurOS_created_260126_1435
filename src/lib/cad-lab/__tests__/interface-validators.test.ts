/**
 * @file interface-validators.test.ts — Unit tests for interface definition validators.
 */

import {
  verifyInterfaceArithmetic,
  checkComponentCoverage,
  trackDimensionProvenance,
  validateInterfaceStructure,
} from "../interface-validators"

// ─── #1: verifyInterfaceArithmetic ───────────────────────────────────

describe("verifyInterfaceArithmetic", () => {
  it("returns no warnings when sums are correct", () => {
    const iface = `=== a) SPACE BUDGET ===
  Tray depth:      60mm
  Growing zone:   300mm
  Clearance:       40mm
  LED bar:         34mm
  ─────────────────────
  Total per level: 434mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = verifyInterfaceArithmetic(iface)
    expect(results).toHaveLength(0)
  })

  it("flags when sum does not match total", () => {
    const iface = `=== a) SPACE BUDGET ===
  Tray depth:      60mm
  Growing zone:   300mm
  Clearance:       40mm
  LED bar:         34mm
  ─────────────────────
  Total per level: 500mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = verifyInterfaceArithmetic(iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("arith-sum-mismatch")
    expect(results[0].severity).toBe("warning")
    expect(results[0].message).toContain("434")
    expect(results[0].message).toContain("500")
  })

  it("tolerates differences ≤1mm", () => {
    const iface = `=== a) SPACE BUDGET ===
  Width:    100mm
  Gap:       50mm
  ─────────
  Total:    150.5mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = verifyInterfaceArithmetic(iface)
    expect(results).toHaveLength(0)
  })

  it("scales tolerance for large objects (F1: 0.5% of total)", () => {
    // 6058mm container: 0.5% = 30mm tolerance
    const iface = `=== a) SPACE BUDGET ===
  Floor structure:       100mm
  Interior height:      2391mm
  Roof structure:        100mm
  ────────────────────────────
  Total height:         2591mm

=== b) COMPONENT PLACEMENT TABLE ===`

    // 100 + 2391 + 100 = 2591 — exact, should pass
    const exact = verifyInterfaceArithmetic(iface)
    expect(exact).toHaveLength(0)

    // Now test with 10mm discrepancy on a 2591mm total (0.39% < 0.5% threshold)
    const ifaceSmallDiff = `=== a) SPACE BUDGET ===
  Floor structure:       100mm
  Interior height:      2391mm
  Roof structure:        110mm
  ────────────────────────────
  Total height:         2591mm

=== b) COMPONENT PLACEMENT TABLE ===`

    // 100 + 2391 + 110 = 2601 vs stated 2591 — diff is 10mm, tolerance is 12.96mm (0.5% of 2591)
    const scaled = verifyInterfaceArithmetic(ifaceSmallDiff)
    expect(scaled).toHaveLength(0)
  })

  it("still catches large errors on large objects", () => {
    const iface = `=== a) SPACE BUDGET ===
  Floor structure:       100mm
  Interior height:      2391mm
  Roof structure:        200mm
  ────────────────────────────
  Total height:         2591mm

=== b) COMPONENT PLACEMENT TABLE ===`

    // 100 + 2391 + 200 = 2691 vs stated 2591 — diff is 100mm, well over 12.96mm tolerance
    const results = verifyInterfaceArithmetic(iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("arith-sum-mismatch")
  })

  it("returns empty for missing space budget section", () => {
    const iface = `=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions |
|-----------|-----|------------|
| Motor     | 4   | 42×42×40mm |`

    const results = verifyInterfaceArithmetic(iface)
    expect(results).toHaveLength(0)
  })
})

// ─── #2: checkComponentCoverage ──────────────────────────────────────

describe("checkComponentCoverage", () => {
  const interfaceDef = `=== b) COMPONENT PLACEMENT TABLE ===
| Component        | Qty | Dimensions     | Position       | Notes  |
|------------------|-----|----------------|----------------|--------|
| Motor Mount      | 4   | 42×42×30mm     | (±100, ±100, 0)| NEMA 17|
| Frame Base       | 1   | 250×250×3mm    | (0, 0, 0)      |        |
| Battery Holder   | 1   | 100×50×20mm    | (0, 0, -25)    |        |
| Propeller Guard  | 4   | Ø120×10mm      | (±100, ±100, 40)|       |

=== c) CONNECTION MAP ===`

  it("returns no warnings when all components have matching functions", () => {
    const code = `
def make_motor_mount():
    return cq.Workplane("XY").box(42, 42, 30)

def make_frame_base():
    return cq.Workplane("XY").box(250, 250, 3)

def make_battery_holder():
    return cq.Workplane("XY").box(100, 50, 20)

def make_propeller_guard():
    return cq.Workplane("XY").cylinder(10, 60)
`
    const results = checkComponentCoverage(interfaceDef, code)
    expect(results).toHaveLength(0)
  })

  it("flags missing make_*() functions", () => {
    const code = `
def make_motor_mount():
    return cq.Workplane("XY").box(42, 42, 30)

def make_frame_base():
    return cq.Workplane("XY").box(250, 250, 3)
`
    const results = checkComponentCoverage(interfaceDef, code)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("coverage-missing-component")
    expect(results[0].message).toContain("Battery Holder")
  })

  it("handles fuzzy matching (naming variations)", () => {
    const code = `
def make_nema17_motor_bracket():
    return cq.Workplane("XY").box(42, 42, 30)

def make_base_frame():
    return cq.Workplane("XY").box(250, 250, 3)

def make_lipo_battery_holder():
    return cq.Workplane("XY").box(100, 50, 20)

def make_prop_guard():
    return cq.Workplane("XY").cylinder(10, 60)
`
    const results = checkComponentCoverage(interfaceDef, code)
    // "prop guard" should fuzzy-match "Propeller Guard" (keyword "guard" overlap)
    // "base frame" should match "Frame Base"
    // "battery holder" matches directly
    // motor_bracket vs motor_mount — "motor" overlaps
    expect(results).toHaveLength(0)
  })
})

// ─── #6: trackDimensionProvenance ────────────────────────────────────

describe("trackDimensionProvenance", () => {
  it("returns no warnings when all dimensions trace to research", () => {
    const research = `The NEMA 17 stepper motor has a 42.3mm face, 40mm body height, and 31mm mounting hole spacing.`
    const iface = `Motor width: 42.3mm
Motor height: 40mm
Hole spacing: 31mm`

    const results = trackDimensionProvenance(research, iface)
    expect(results).toHaveLength(0)
  })

  it("flags dimensions not found in research", () => {
    const research = `The motor face is 42.3mm square.`
    const iface = `Motor width: 42.3mm
Motor height: 40mm
Random dimension: 77mm`

    const results = trackDimensionProvenance(research, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("provenance-unresearched-dim")
    // 40mm and 77mm are not in research
    expect(results[0].message).toMatch(/40mm|77mm/)
  })

  // D2: Tighter tolerance — 2mm absolute / 2% relative
  it("allows 2% tolerance on matching (D2)", () => {
    const research = `The housing is 100mm wide.`
    const iface = `Housing width: 102mm` // 2% over, within tolerance

    const results = trackDimensionProvenance(research, iface)
    expect(results).toHaveLength(0)
  })

  it("flags dimensions outside 2% tolerance (D2)", () => {
    const research = `The housing is 100mm wide.`
    const iface = `Housing width: 106mm` // 6% over, outside tolerance

    const results = trackDimensionProvenance(research, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("provenance-unresearched-dim")
  })

  it("skips small values (<5mm) as likely clearances", () => {
    const research = `The bracket is 50mm wide.`
    const iface = `Bracket width: 50mm
Clearance: 2mm
Gap: 3mm`

    const results = trackDimensionProvenance(research, iface)
    expect(results).toHaveLength(0)
  })

  // B5: Round numbers should NOW be flagged (no longer skipped)
  it("flags round numbers not in research (B5)", () => {
    const research = `The tube is 45mm diameter.`
    const iface = `Tube OD: 45mm
Total height: 500mm`

    const results = trackDimensionProvenance(research, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("provenance-unresearched-dim")
    expect(results[0].message).toContain("500mm")
  })
})

// ─── B1: validateInterfaceStructure ──────────────────────────────────

describe("validateInterfaceStructure", () => {
  it("returns no warnings when all 4 sections present", () => {
    const iface = `=== a) SPACE BUDGET ===
Some content

=== b) COMPONENT PLACEMENT TABLE ===
Some content

=== c) CONNECTION MAP ===
Some content

=== d) VALIDATION CHECKLIST ===
Some content`

    const results = validateInterfaceStructure(iface)
    expect(results).toHaveLength(0)
  })

  it("flags missing sections", () => {
    const iface = `=== a) SPACE BUDGET ===
Some content

=== b) COMPONENT PLACEMENT TABLE ===
Some content`

    const results = validateInterfaceStructure(iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("iface-missing-section")
    expect(results[0].message).toContain("CONNECTION MAP")
    expect(results[0].message).toContain("VALIDATION CHECKLIST")
  })

  it("flags completely empty interface", () => {
    const results = validateInterfaceStructure("Just some random text")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].message).toContain("4 required section(s)")
  })
})
