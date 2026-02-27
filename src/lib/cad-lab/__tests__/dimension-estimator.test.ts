/**
 * @file dimension-estimator.test.ts — Unit tests for the safe Python expression evaluator
 * and dimension estimator.
 */

import {
  safeEval,
  estimateDimensions,
  validateEstimatedDimensions,
} from "../dimension-estimator"

// ─── safeEval ────────────────────────────────────────────────────────

describe("safeEval", () => {
  it("evaluates simple arithmetic", () => {
    expect(safeEval("10 + 20", {})).toBe(30)
    expect(safeEval("100 - 37", {})).toBe(63)
    expect(safeEval("6 * 7", {})).toBe(42)
    expect(safeEval("100 / 4", {})).toBe(25)
  })

  it("handles operator precedence", () => {
    expect(safeEval("2 + 3 * 4", {})).toBe(14)
    expect(safeEval("(2 + 3) * 4", {})).toBe(20)
  })

  it("resolves variables from symbol table", () => {
    const symbols = { count: 10, height: 29, gap: 3 }
    expect(safeEval("count * height", symbols)).toBe(290)
    expect(safeEval("count * height + (count - 1) * gap", symbols)).toBe(317)
  })

  it("evaluates math.pi", () => {
    const result = safeEval("math.pi * 25", {})
    expect(result).toBeCloseTo(Math.PI * 25)
  })

  it("evaluates math.sqrt", () => {
    expect(safeEval("math.sqrt(144)", {})).toBe(12)
  })

  it("evaluates math.ceil and math.floor", () => {
    expect(safeEval("math.ceil(4.2)", {})).toBe(5)
    expect(safeEval("math.floor(4.9)", {})).toBe(4)
  })

  it("handles negative numbers", () => {
    expect(safeEval("-10 + 20", {})).toBe(10)
    expect(safeEval("-(3 + 4)", {})).toBe(-7)
  })

  it("returns null for division by zero", () => {
    expect(safeEval("10 / 0", {})).toBeNull()
  })

  it("returns null for unknown variables", () => {
    expect(safeEval("unknown_var + 5", {})).toBeNull()
  })

  it("rejects dangerous expressions", () => {
    expect(safeEval("import os", {})).toBeNull()
    expect(safeEval("eval('1+1')", {})).toBeNull()
    expect(safeEval("exec('print(1)')", {})).toBeNull()
    expect(safeEval("[1, 2, 3]", {})).toBeNull()
    expect(safeEval("x if True else y", { x: 1, y: 2 })).toBeNull()
    expect(safeEval("'hello'", {})).toBeNull()
    expect(safeEval("x > 5", { x: 10 })).toBeNull()
  })

  it("evaluates trig functions (F4)", () => {
    // math.sin(math.pi / 2) = 1.0
    expect(safeEval("math.sin(math.pi / 2)", {})).toBeCloseTo(1.0)
    // math.cos(0) = 1.0
    expect(safeEval("math.cos(0)", {})).toBeCloseTo(1.0)
    // math.tan(0) = 0
    expect(safeEval("math.tan(0)", {})).toBeCloseTo(0)
  })

  it("evaluates angle conversion (F4)", () => {
    // math.radians(180) = pi
    expect(safeEval("math.radians(180)", {})).toBeCloseTo(Math.PI)
    // math.degrees(math.pi) = 180
    expect(safeEval("math.degrees(math.pi)", {})).toBeCloseTo(180)
  })

  it("evaluates math.log and math.exp (F4)", () => {
    expect(safeEval("math.log(1)", {})).toBe(0)
    expect(safeEval("math.exp(0)", {})).toBe(1)
    expect(safeEval("math.exp(1)", {})).toBeCloseTo(Math.E)
  })

  it("evaluates int(), round(), abs() builtins (F4)", () => {
    expect(safeEval("int(4.9)", {})).toBe(4)
    expect(safeEval("round(4.5)", {})).toBe(5)
    expect(safeEval("round(4.4)", {})).toBe(4)
    expect(safeEval("abs(-42)", {})).toBe(42)
    expect(safeEval("abs(42)", {})).toBe(42)
  })

  it("evaluates min() and max() with two args (F4)", () => {
    expect(safeEval("min(10, 20)", {})).toBe(10)
    expect(safeEval("max(10, 20)", {})).toBe(20)
    expect(safeEval("min(3 + 2, 10 - 3)", {})).toBe(5)
    expect(safeEval("max(3 + 2, 10 - 3)", {})).toBe(7)
  })

  it("evaluates min/max with variables (F4)", () => {
    const symbols = { a: 42, b: 100 }
    expect(safeEval("min(a, b)", symbols)).toBe(42)
    expect(safeEval("max(a, b)", symbols)).toBe(100)
  })

  it("handles decimal numbers", () => {
    expect(safeEval("3.14 * 2", {})).toBeCloseTo(6.28)
    expect(safeEval("0.5 + 0.5", {})).toBe(1)
  })

  it("handles nested parentheses", () => {
    expect(safeEval("((2 + 3) * (4 - 1))", {})).toBe(15)
  })

  // C3: Power operator support
  it("evaluates ** power operator (C3)", () => {
    expect(safeEval("2 ** 10", {})).toBe(1024)
    expect(safeEval("3 ** 2", {})).toBe(9)
  })

  it("evaluates ** with variables (C3)", () => {
    const symbols = { r: 5 }
    // Circle area: math.pi * r**2
    const result = safeEval("math.pi * r ** 2", symbols)
    expect(result).toBeCloseTo(Math.PI * 25)
  })

  it("evaluates right-associative ** (C3)", () => {
    // 2**3**2 = 2**(3**2) = 2**9 = 512
    expect(safeEval("2 ** 3 ** 2", {})).toBe(512)
  })
})

// ─── estimateDimensions ──────────────────────────────────────────────

describe("estimateDimensions", () => {
  it("extracts simple parameter assignments", () => {
    const code = `
import cadquery as cq

# Primary parameters
total_width = 250
total_depth = 200
total_height = 150

def make_body():
    return cq.Workplane("XY").box(total_width, total_depth, total_height)

result = make_body()
`
    const estimate = estimateDimensions(code)
    expect(estimate.symbols.total_width).toBe(250)
    expect(estimate.symbols.total_depth).toBe(200)
    expect(estimate.symbols.total_height).toBe(150)
    expect(estimate.predictedBbox).toEqual({ x: 250, y: 200, z: 150 })
  })

  it("resolves derived expressions", () => {
    const code = `
import cadquery as cq

capsule_count = 10
capsule_h = 29
gap = 3
total_height = capsule_count * capsule_h + (capsule_count - 1) * gap
tube_od = 45

def make_tube():
    pass

result = make_tube()
`
    const estimate = estimateDimensions(code)
    expect(estimate.symbols.total_height).toBe(317)
    expect(estimate.symbols.capsule_count).toBe(10)
    expect(estimate.predictedBbox?.z).toBe(317)
  })

  it("handles unresolvable variables gracefully", () => {
    const code = `
import cadquery as cq

width = some_function()
height = 100

result = cq.Workplane("XY").box(width, width, height)
`
    const estimate = estimateDimensions(code)
    expect(estimate.unresolvedVars).toContain("width")
    expect(estimate.symbols.height).toBe(100)
  })

  it("stops parsing at first def statement", () => {
    const code = `
width = 100
height = 200

def make_body():
    internal_var = 999  # should not be parsed
    return cq.Workplane("XY").box(100, 100, 100)

result = make_body()
`
    const estimate = estimateDimensions(code)
    expect(estimate.symbols.width).toBe(100)
    expect(estimate.symbols.height).toBe(200)
    expect(estimate.symbols.internal_var).toBeUndefined()
  })

  // C4: True/False/None should not appear in unresolvedVars
  it("skips True/False/None assignments (C4)", () => {
    const code = `
import cadquery as cq

width = 100
use_fillet = True
has_chamfer = False
temp_result = None
height = 200

def make_body():
    return cq.Workplane("XY").box(100, 100, 100)

result = make_body()
`
    const estimate = estimateDimensions(code)
    expect(estimate.symbols.width).toBe(100)
    expect(estimate.symbols.height).toBe(200)
    expect(estimate.unresolvedVars).not.toContain("use_fillet")
    expect(estimate.unresolvedVars).not.toContain("has_chamfer")
    expect(estimate.unresolvedVars).not.toContain("temp_result")
  })
})

// ─── validateEstimatedDimensions ─────────────────────────────────────

describe("validateEstimatedDimensions", () => {
  it("returns no warnings when dimensions match interface", () => {
    const estimate = {
      symbols: { total_width: 250, total_depth: 200, total_height: 150 },
      predictedBbox: { x: 250, y: 200, z: 150 },
      unresolvedVars: [],
    }
    const iface = `Overall: 250×200×150mm`

    const results = validateEstimatedDimensions(estimate, iface)
    expect(results).toHaveLength(0)
  })

  it("flags critical when dimensions differ >3×", () => {
    const estimate = {
      symbols: { total_width: 50, total_depth: 40, total_height: 30 },
      predictedBbox: { x: 50, y: 40, z: 30 },
      unresolvedVars: [],
    }
    const iface = `Overall: 250×200×150mm`

    const results = validateEstimatedDimensions(estimate, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("dim-estimate-mismatch")
    expect(results[0].severity).toBe("critical")
  })

  it("returns info when no predicted bbox (F7)", () => {
    const estimate = {
      symbols: {},
      predictedBbox: null,
      unresolvedVars: ["width", "height"],
    }
    const iface = `Overall: 250×200×150mm`

    const results = validateEstimatedDimensions(estimate, iface)
    expect(results).toHaveLength(1)
    expect(results[0].ruleId).toBe("dim-estimate-skipped")
    expect(results[0].severity).toBe("info")
    expect(results[0].message).toContain("2 unresolved variables")
  })
})
