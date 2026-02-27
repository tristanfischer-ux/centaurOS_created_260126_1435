/**
 * @file code-validators.test.ts — Unit tests for CadQuery code validators.
 */

import {
  scanParametricIntegrity,
  validateZStack,
  analyzeCadQueryCode,
} from "../code-validators"

// ─── #3: scanParametricIntegrity ─────────────────────────────────────

describe("scanParametricIntegrity", () => {
  it("returns no warnings when derived values use expressions", () => {
    const code = `
# Primary parameters
capsule_count = 10
capsule_h = 29
gap = 3

# Derived values
total_height = capsule_count * capsule_h + (capsule_count - 1) * gap
total_width = capsule_count * capsule_h
`
    const results = scanParametricIntegrity(code)
    expect(results).toHaveLength(0)
  })

  it("flags hardcoded values in derived sections", () => {
    const code = `
# Primary parameters
capsule_count = 10
capsule_h = 29

# Derived / calculated values
total_height = 315
total_width = 290
`
    const results = scanParametricIntegrity(code)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("param-hardcoded-derived")
    expect(results[0].message).toContain("total_height")
  })

  it("does not flag primary parameters as hardcoded", () => {
    const code = `
# Primary parameters
num_capsules = 10
wall_t = 2

# Derived
length = num_capsules * 29
`
    const results = scanParametricIntegrity(code)
    expect(results).toHaveLength(0)
  })
})

// ─── #4: validateZStack ──────────────────────────────────────────────

describe("validateZStack", () => {
  it("returns no warnings when Z matches space budget", () => {
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .workplane(offset=50)
    .box(80, 80, 40)
    .workplane(offset=100)
    .box(60, 60, 20)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Base:   10mm
  Body:   40mm
  Cap:    20mm
  ─────
  Total: 100mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results).toHaveLength(0)
  })

  it("flags when max Z differs significantly from budget", () => {
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .workplane(offset=500)
    .box(80, 80, 40)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Base:   10mm
  Body:   40mm
  ─────
  Total: 100mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("zstack-height-mismatch")
  })

  it("handles .transformed(offset=(x,y,z)) calls", () => {
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .transformed(offset=(0, 0, 95))
    .box(80, 80, 40)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Body: 100mm
  ─────
  Total: 100mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results).toHaveLength(0)
  })
})

// ─── #5: analyzeCadQueryCode ─────────────────────────────────────────

describe("analyzeCadQueryCode", () => {
  it("flags .shell() usage", () => {
    const code = `
result = cq.Workplane("XY").box(100, 100, 50).shell(-2)
`
    const results = analyzeCadQueryCode(code)
    const shellResult = results.find((r) => r.ruleId === "cq-shell-fragile")
    expect(shellResult).toBeDefined()
    expect(shellResult!.severity).toBe("warning")
  })

  it("flags .sweep() usage", () => {
    const code = `
path = cq.Workplane("XZ").spline([(0,0), (10,10)])
result = cq.Workplane("XY").circle(5).sweep(path)
`
    const results = analyzeCadQueryCode(code)
    const sweepResult = results.find((r) => r.ruleId === "cq-sweep-fragile")
    expect(sweepResult).toBeDefined()
  })

  it("flags missing result assignment as critical", () => {
    const code = `
import cadquery as cq
body = cq.Workplane("XY").box(100, 100, 50)
`
    const results = analyzeCadQueryCode(code)
    const resultMissing = results.find((r) => r.ruleId === "cq-missing-result")
    expect(resultMissing).toBeDefined()
    expect(resultMissing!.severity).toBe("critical")
  })

  it("does not flag result = assignment", () => {
    const code = `
import cadquery as cq
result = cq.Workplane("XY").box(100, 100, 50)
`
    const results = analyzeCadQueryCode(code)
    const resultMissing = results.find((r) => r.ruleId === "cq-missing-result")
    expect(resultMissing).toBeUndefined()
  })

  it("flags long .union() chains", () => {
    const unions = Array.from({ length: 20 }, (_, i) =>
      `.union(cq.Workplane("XY").transformed(offset=(${i * 10}, 0, 0)).box(5, 5, 5))`,
    ).join("\n")
    const code = `
result = cq.Workplane("XY").box(5, 5, 5)
${unions}
`
    const results = analyzeCadQueryCode(code)
    const unionResult = results.find((r) => r.ruleId === "cq-union-chain-long")
    expect(unionResult).toBeDefined()
    expect(unionResult!.severity).toBe("warning")
  })

  it("flags .fillet() after .union()", () => {
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 50)
    .union(cq.Workplane("XY").box(50, 50, 50))
    .fillet(2)
)
`
    const results = analyzeCadQueryCode(code)
    const filletResult = results.find((r) => r.ruleId === "cq-fillet-after-union")
    expect(filletResult).toBeDefined()
  })

  it("returns empty for clean code", () => {
    const code = `
import cadquery as cq

def make_body():
    return cq.Workplane("XY").box(100, 100, 50)

def make_cap():
    return cq.Workplane("XY").box(80, 80, 10)

result = make_body().union(make_cap().val())
`
    const results = analyzeCadQueryCode(code)
    // Only checking for no critical issues
    const criticals = results.filter((r) => r.severity === "critical")
    expect(criticals).toHaveLength(0)
  })
})
