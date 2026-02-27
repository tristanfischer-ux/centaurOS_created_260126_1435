/**
 * @file code-validators.test.ts — Unit tests for CadQuery code validators.
 */

import {
  checkPythonSyntax,
  scanParametricIntegrity,
  validateZStack,
  analyzeCadQueryCode,
  checkFunctionInvocations,
  checkLibraryUsage,
  categorizeModalError,
  stripUnsafeCode,
} from "../code-validators"

// ─── R4: checkPythonSyntax ──────────────────────────────────────────

describe("checkPythonSyntax", () => {
  it("returns no issues for valid code", () => {
    const code = `import cadquery as cq

def make_body():
    return cq.Workplane("XY").box(100, 100, 50)

result = make_body()
`
    const results = checkPythonSyntax(code)
    expect(results).toHaveLength(0)
  })

  it("flags unmatched closing paren as critical", () => {
    const code = `import cadquery as cq
result = cq.Workplane("XY").box(100, 100, 50))
`
    const results = checkPythonSyntax(code)
    const unmatched = results.find((r) => r.ruleId === "syntax-unmatched-bracket")
    expect(unmatched).toBeDefined()
    expect(unmatched!.severity).toBe("critical")
  })

  it("flags unclosed opening paren as critical", () => {
    const code = `import cadquery as cq
result = (
    cq.Workplane("XY")
    .box(100, 100, 50)
`
    const results = checkPythonSyntax(code)
    const unclosed = results.find((r) => r.ruleId === "syntax-unclosed-bracket")
    expect(unclosed).toBeDefined()
    expect(unclosed!.severity).toBe("critical")
  })

  it("flags missing cq import as critical", () => {
    const code = `result = cq.Workplane("XY").box(100, 100, 50)
`
    const results = checkPythonSyntax(code)
    const missing = results.find((r) => r.ruleId === "syntax-missing-cq-import")
    expect(missing).toBeDefined()
    expect(missing!.severity).toBe("critical")
  })

  it("ignores brackets inside strings and comments", () => {
    const code = `import cadquery as cq
# This comment has unmatched brackets: ( [ {
label = "opening bracket: ("
label2 = 'closing bracket: )'
result = cq.Workplane("XY").box(100, 100, 50)
`
    const results = checkPythonSyntax(code)
    expect(results).toHaveLength(0)
  })

  it("handles triple-quoted strings with brackets", () => {
    const code = `import cadquery as cq
doc = """This has brackets ( [ { inside triple quotes"""
result = cq.Workplane("XY").box(100, 100, 50)
`
    const results = checkPythonSyntax(code)
    expect(results).toHaveLength(0)
  })

  it("accepts 'from cadquery import' as valid import", () => {
    const code = `from cadquery import Workplane
result = Workplane("XY").box(100, 100, 50)
`
    const results = checkPythonSyntax(code)
    const missing = results.find((r) => r.ruleId === "syntax-missing-cq-import")
    expect(missing).toBeUndefined()
  })
})

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

  // C1: Expanded primary params should not be flagged
  it("does not flag expanded primary params (C1)", () => {
    const code = `
# Derived
bolt_diameter = 8
bolt_radius = 4
hole_spacing = 31
fin_pitch = 5
vent_gap = 2
plate_thickness = 3
bracket_angle = 45
z_offset = 10
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

  // E4: Scaled tolerance — small objects get ±20%, large objects get ±10%
  it("allows ±20% for small objects (≤100mm) (E4)", () => {
    // 50mm budget, 19% over = 59.5mm → should pass (within 20%)
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .workplane(offset=59)
    .box(80, 80, 10)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Base:   10mm
  Cap:    40mm
  ─────
  Total: 50mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results).toHaveLength(0)
  })

  it("flags >20% mismatch for small objects (E4)", () => {
    // 50mm budget, 60mm span → 20% over → just at boundary
    // 50mm budget, 65mm span → 30% over → should flag
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .workplane(offset=65)
    .box(80, 80, 10)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Base:   10mm
  Cap:    40mm
  ─────
  Total: 50mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("zstack-height-mismatch")
  })

  it("uses tighter ±10% tolerance for large objects (≥1000mm) (E4)", () => {
    // 2000mm budget, 15% over = 2300mm → should flag (exceeds 10%)
    const code = `
result = (
    cq.Workplane("XY")
    .box(1000, 1000, 100)
    .workplane(offset=2300)
    .box(800, 800, 100)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Base:   100mm
  Body:   1800mm
  Cap:    100mm
  ─────
  Total: 2000mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("zstack-height-mismatch")
  })

  it("allows ±10% for large objects (E4)", () => {
    // 2000mm budget, 9% over = 2180mm → should pass
    const code = `
result = (
    cq.Workplane("XY")
    .box(1000, 1000, 100)
    .workplane(offset=2180)
    .box(800, 800, 100)
)
`
    const iface = `=== a) SPACE BUDGET ===
  Base:   100mm
  Body:   1800mm
  Cap:    100mm
  ─────
  Total: 2000mm

=== b) COMPONENT PLACEMENT TABLE ===`

    const results = validateZStack(code, iface)
    expect(results).toHaveLength(0)
  })

  // A1: Negative Z offsets should be handled correctly via span
  it("handles negative Z offsets correctly (A1)", () => {
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .workplane(offset=-20)
    .box(80, 80, 20)
    .workplane(offset=80)
    .box(60, 60, 10)
)
`
    // Span: max(0, 80) - min(0, -20) = 80 - (-20) = 100mm
    const iface = `=== a) SPACE BUDGET ===
  Below:   20mm
  Base:    10mm
  Above:   70mm
  ─────
  Total:  100mm

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

  // D1: result = None as final assignment
  it("flags result = None as final assignment (D1)", () => {
    const code = `
import cadquery as cq
result = None
body = cq.Workplane("XY").box(100, 100, 50)
result = None
`
    const results = analyzeCadQueryCode(code)
    const noneResult = results.find((r) => r.ruleId === "cq-result-none")
    expect(noneResult).toBeDefined()
    expect(noneResult!.severity).toBe("critical")
  })

  it("does not flag result = None when later reassigned (D1)", () => {
    const code = `
import cadquery as cq
result = None  # initialiser
body = cq.Workplane("XY").box(100, 100, 50)
result = body
`
    const results = analyzeCadQueryCode(code)
    const noneResult = results.find((r) => r.ruleId === "cq-result-none")
    expect(noneResult).toBeUndefined()
  })
})

// ─── A2: checkFunctionInvocations ────────────────────────────────────

describe("checkFunctionInvocations", () => {
  it("returns no warnings when all functions are called", () => {
    const code = `
def make_body():
    return cq.Workplane("XY").box(100, 100, 50)

def make_cap():
    return cq.Workplane("XY").box(80, 80, 10)

result = make_body().union(make_cap())
`
    const results = checkFunctionInvocations(code)
    expect(results).toHaveLength(0)
  })

  it("flags uncalled make_* functions", () => {
    const code = `
def make_body():
    return cq.Workplane("XY").box(100, 100, 50)

def make_cap():
    return cq.Workplane("XY").box(80, 80, 10)

def make_handle():
    return cq.Workplane("XY").box(20, 20, 40)

result = make_body().union(make_cap())
`
    const results = checkFunctionInvocations(code)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("cq-uncalled-make-fn")
    expect(results[0].message).toContain("make_handle")
  })

  it("returns no warnings when no make_* functions exist", () => {
    const code = `
result = cq.Workplane("XY").box(100, 100, 50)
`
    const results = checkFunctionInvocations(code)
    expect(results).toHaveLength(0)
  })
})

// ─── F2: Code-specific repair hints ─────────────────────────────────

describe("scanParametricIntegrity repairHint (F2)", () => {
  it("includes actual variable names in repairHint", () => {
    const code = `
# Derived values
total_height = 315
total_width = 290
`
    const results = scanParametricIntegrity(code)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].repairHint).toContain("total_height")
    expect(results[0].repairHint).toContain("total_width")
  })
})

describe("validateZStack repairHint (F2)", () => {
  it("includes actual Z offsets in repairHint", () => {
    const code = `
result = (
    cq.Workplane("XY")
    .box(100, 100, 10)
    .workplane(offset=500)
    .workplane(offset=200)
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
    expect(results[0].repairHint).toMatch(/min=/)
    expect(results[0].repairHint).toMatch(/max=/)
    expect(results[0].repairHint).toContain("200")
    expect(results[0].repairHint).toContain("500")
  })
})

// ─── F3: checkLibraryUsage ──────────────────────────────────────────

describe("checkLibraryUsage", () => {
  it("flags custom functions that duplicate library components", () => {
    const code = `
def make_hex_bolt():
    return cq.Workplane("XY").cylinder(10, 3)

result = make_hex_bolt()
`
    const results = checkLibraryUsage(code, ["hex_bolt", "nema17_motor"])
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].ruleId).toBe("library-unused-duplicate")
    expect(results[0].severity).toBe("info")
    expect(results[0].message).toContain("hex_bolt")
  })

  it("skips when library component is already called directly", () => {
    const code = `
bolt = hex_bolt(length=20)
result = bolt
`
    const results = checkLibraryUsage(code, ["hex_bolt"])
    expect(results).toHaveLength(0)
  })

  it("skips unrelated custom functions", () => {
    const code = `
def make_custom_bracket():
    return cq.Workplane("XY").box(30, 20, 5)

result = make_custom_bracket()
`
    const results = checkLibraryUsage(code, ["hex_bolt", "nema17_motor"])
    expect(results).toHaveLength(0)
  })

  it("returns empty when no library slugs provided", () => {
    const code = `
def make_hex_bolt():
    return cq.Workplane("XY").cylinder(10, 3)

result = make_hex_bolt()
`
    const results = checkLibraryUsage(code, [])
    expect(results).toHaveLength(0)
  })
})

// ─── F6: categorizeModalError ───────────────────────────────────────

describe("categorizeModalError", () => {
  it("categorizes SyntaxError", () => {
    const result = categorizeModalError("SyntaxError: invalid syntax (line 42)")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("SyntaxError")
  })

  it("categorizes NameError with variable name", () => {
    const result = categorizeModalError("NameError: name 'make_frame' is not defined")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("NameError")
    expect(result!.guidance).toContain("make_frame")
  })

  it("categorizes Standard_DomainError", () => {
    const result = categorizeModalError("OCC.Core.Standard: Standard_DomainError")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("Standard_DomainError")
  })

  it("categorizes timeout errors", () => {
    const result = categorizeModalError("TimeoutError: execution timed out after 120s")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("TimeoutError")
  })

  it("returns null for unrecognized errors", () => {
    const result = categorizeModalError("UnknownWeirdError: something unexpected")
    expect(result).toBeNull()
  })

  it("returns null for empty input", () => {
    const result = categorizeModalError("")
    expect(result).toBeNull()
  })

  // H2: Expanded error patterns
  it("categorizes TypeError", () => {
    const result = categorizeModalError("TypeError: unsupported operand type(s) for +: 'int' and 'str'")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("TypeError")
    expect(result!.guidance).toContain("argument types")
  })

  it("categorizes ValueError", () => {
    const result = categorizeModalError("ValueError: math domain error")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("ValueError")
    expect(result!.guidance).toContain("out of range")
  })

  it("categorizes AttributeError", () => {
    const result = categorizeModalError("AttributeError: 'Workplane' object has no attribute 'boxz'")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("AttributeError")
    expect(result!.guidance).toContain("CadQuery API")
  })

  it("categorizes ImportError", () => {
    const result = categorizeModalError("ImportError: No module named 'numpy'")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("ImportError")
    expect(result!.guidance).toContain("cadquery and math")
  })

  it("categorizes ModuleNotFoundError", () => {
    const result = categorizeModalError("ModuleNotFoundError: No module named 'scipy'")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("ImportError")
  })

  it("categorizes MemoryError", () => {
    const result = categorizeModalError("MemoryError: unable to allocate array")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("MemoryError")
    expect(result!.guidance).toContain("complexity")
  })

  it("categorizes killed process as MemoryError", () => {
    const result = categorizeModalError("Process killed by OOM killer")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("MemoryError")
  })

  it("categorizes IndentationError", () => {
    const result = categorizeModalError("IndentationError: unexpected indent (line 15)")
    expect(result).not.toBeNull()
    expect(result!.category).toBe("IndentationError")
    expect(result!.guidance).toContain("4-space")
  })
})

// ─── H1: stripUnsafeCode ──────────────────────────────────────────────

describe("stripUnsafeCode", () => {
  it("strips print() statements", () => {
    const code = `import cadquery as cq
print("debug")
result = cq.Workplane("XY").box(10, 10, 10)
print( "more debug" )`
    const result = stripUnsafeCode(code)
    expect(result).not.toContain("print(")
    expect(result).toContain("import cadquery as cq")
    expect(result).toContain("result =")
  })

  it("strips os and sys imports", () => {
    const code = `import cadquery as cq
import os
from os import path
import sys
from sys import argv
result = cq.Workplane("XY").box(10, 10, 10)`
    const result = stripUnsafeCode(code)
    expect(result).not.toContain("import os")
    expect(result).not.toContain("from os")
    expect(result).not.toContain("import sys")
    expect(result).not.toContain("from sys")
    expect(result).toContain("import cadquery")
  })

  it("strips cq.exporters calls", () => {
    const code = `import cadquery as cq
result = cq.Workplane("XY").box(10, 10, 10)
cq.exporters.export(result, "output.step")`
    const result = stripUnsafeCode(code)
    expect(result).not.toContain("cq.exporters")
  })

  it("strips dangerous builtins", () => {
    const code = `import cadquery as cq
exec("print('hello')")
eval("1+1")
__import__("os")
result = cq.Workplane("XY").box(10, 10, 10)`
    const result = stripUnsafeCode(code)
    expect(result).not.toContain("exec(")
    expect(result).not.toContain("eval(")
    expect(result).not.toContain("__import__(")
  })

  it("strips open() calls", () => {
    const code = `import cadquery as cq
f = open("/etc/passwd", "r")
result = cq.Workplane("XY").box(10, 10, 10)`
    const result = stripUnsafeCode(code)
    expect(result).not.toContain("open(")
  })

  it("preserves clean code unchanged", () => {
    const code = `import cadquery as cq
import math

width = 100
height = 50

def make_box():
    return cq.Workplane("XY").box(width, height, 30)

result = make_box()`
    const result = stripUnsafeCode(code)
    expect(result).toBe(code)
  })
})
