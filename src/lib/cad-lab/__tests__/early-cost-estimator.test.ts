import {
  parseComponentPlacementTable,
  estimateModuleCost,
  estimateEarlyCost,
} from "../early-cost-estimator"

/* ─── parseComponentPlacementTable ──────────────────────────────────── */

describe("parseComponentPlacementTable", () => {
  it("parses a well-formed component placement table", () => {
    const interfaceDef = `
=== a) SPACE BUDGET ===
Overall: 200 x 150 x 50 mm

=== b) COMPONENT PLACEMENT TABLE ===
| Component        | Qty | Dimensions          | Position       | Material        |
|------------------|-----|---------------------|----------------|-----------------|
| Main Housing     | 1   | 200×150×50          | Origin         | Aluminum 6061   |
| Motor Mount      | 2   | 40×40×30            | Left, Right    | Steel           |
| PCB Board        | 1   | 80×60×2             | Center         | FR4             |

=== c) CONNECTION MAP ===
`
    const result = parseComponentPlacementTable(interfaceDef)
    expect(result).toHaveLength(3)

    expect(result[0]).toEqual({
      name: "Main Housing",
      quantity: 1,
      dimensions: [200, 150, 50],
      material: "Aluminum 6061",
    })

    expect(result[1]).toEqual({
      name: "Motor Mount",
      quantity: 2,
      dimensions: [40, 40, 30],
      material: "Steel",
    })

    expect(result[2]).toEqual({
      name: "PCB Board",
      quantity: 1,
      dimensions: [80, 60, 2],
      material: null, // FR4 not in material keywords
    })
  })

  it("handles × (unicode multiplication sign) in dimensions", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions    |
|-----------|-----|---------------|
| Frame     | 1   | 300×200×100   |

=== c) CONNECTION MAP ===
`
    const result = parseComponentPlacementTable(interfaceDef)
    expect(result).toHaveLength(1)
    expect(result[0].dimensions).toEqual([300, 200, 100])
  })

  it("handles lowercase x in dimensions", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions    |
|-----------|-----|---------------|
| Bracket   | 4   | 50x30x10      |

=== c) CONNECTION MAP ===
`
    const result = parseComponentPlacementTable(interfaceDef)
    expect(result).toHaveLength(1)
    expect(result[0].dimensions).toEqual([50, 30, 10])
    expect(result[0].quantity).toBe(4)
  })

  it("returns empty array when no table section found", () => {
    const result = parseComponentPlacementTable("No sections here")
    expect(result).toEqual([])
  })

  it("returns empty array when table has no data rows", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions |
|-----------|-----|------------|

=== c) CONNECTION MAP ===
`
    const result = parseComponentPlacementTable(interfaceDef)
    expect(result).toEqual([])
  })

  it("handles decimal dimensions", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions         |
|-----------|-----|--------------------|
| Gasket    | 1   | 150.5×100.2×2.5    |

=== c) CONNECTION MAP ===
`
    const result = parseComponentPlacementTable(interfaceDef)
    expect(result).toHaveLength(1)
    expect(result[0].dimensions).toEqual([150.5, 100.2, 2.5])
  })

  it("defaults quantity to 1 when not parseable", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Notes     | Dimensions |
|-----------|-----------|------------|
| Seal      | important | 20×20×5    |

=== c) CONNECTION MAP ===
`
    const result = parseComponentPlacementTable(interfaceDef)
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(1)
  })
})

/* ─── estimateModuleCost ─────────────────────────────────────────────── */

describe("estimateModuleCost", () => {
  it("returns null for empty components array", () => {
    expect(estimateModuleCost("mod-1", "Test", [])).toBeNull()
  })

  it("returns null when no components have dimensions", () => {
    const components = [
      { name: "Screw", quantity: 10, dimensions: null, material: "Steel" },
    ]
    expect(estimateModuleCost("mod-1", "Test", components as any)).toBeNull()
  })

  it("estimates cost for a known material (aluminum)", () => {
    const components = [
      {
        name: "Housing",
        quantity: 1,
        dimensions: [200, 150, 50] as [number, number, number],
        material: "Aluminum 6061",
      },
    ]

    const result = estimateModuleCost("mod-1", "Housing Module", components)
    expect(result).not.toBeNull()
    expect(result!.moduleId).toBe("mod-1")
    expect(result!.moduleName).toBe("Housing Module")
    expect(result!.material).toBe("Aluminum 6061-T6")
    expect(result!.currency).toBe("USD")
    expect(result!.confidence).toBe("rough")
    expect(result!.componentCount).toBe(1)

    // Volume: 200*150*50 * 0.3 = 450,000 mm³
    expect(result!.estimatedVolumeMm3).toBe(450000)

    // Mass: 450000 / 1e9 * 2700 = 1.215 kg
    expect(result!.estimatedMassKg).toBeCloseTo(1.215, 2)

    // Cost should be positive and totalLow < totalHigh
    expect(result!.totalLow).toBeGreaterThan(0)
    expect(result!.totalHigh).toBeGreaterThan(result!.totalLow)
  })

  it("multiplies by quantity", () => {
    const single = [
      { name: "Mount", quantity: 1, dimensions: [40, 40, 30] as [number, number, number], material: "Steel" },
    ]
    const double = [
      { name: "Mount", quantity: 2, dimensions: [40, 40, 30] as [number, number, number], material: "Steel" },
    ]

    const singleResult = estimateModuleCost("mod-1", "Single", single)
    const doubleResult = estimateModuleCost("mod-1", "Double", double)

    // Mass should double
    expect(doubleResult!.estimatedMassKg).toBeCloseTo(singleResult!.estimatedMassKg * 2, 2)
  })

  it("falls back to default density for unknown materials", () => {
    const components = [
      { name: "Widget", quantity: 1, dimensions: [100, 100, 100] as [number, number, number], material: "Unobtainium" },
    ]

    const result = estimateModuleCost("mod-1", "Widget Module", components)
    expect(result).not.toBeNull()
    // Should still produce an estimate with fallback density
    expect(result!.estimatedMassKg).toBeGreaterThan(0)
  })

  it("uses process hint for cost calculation", () => {
    const components = [
      { name: "Part", quantity: 1, dimensions: [100, 100, 50] as [number, number, number], material: "Aluminum 6061" },
    ]

    const fdm = estimateModuleCost("mod-1", "Part", components, "FDM 3D Print")
    const cnc = estimateModuleCost("mod-1", "Part", components, "CNC Machining")

    // CNC should be more expensive than FDM
    expect(cnc!.totalHigh).toBeGreaterThan(fdm!.totalHigh)
  })
})

/* ─── estimateEarlyCost ──────────────────────────────────────────────── */

describe("estimateEarlyCost", () => {
  it("returns estimate from a valid interface definition", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Dimensions   | Material      |
|-----------|-----|--------------|---------------|
| Frame     | 1   | 300×200×100  | Aluminum 6061 |
| Cover     | 1   | 300×200×5    | Aluminum 6061 |

=== c) CONNECTION MAP ===
`
    const result = estimateEarlyCost("frame-mod", "Frame Module", interfaceDef)
    expect(result).not.toBeNull()
    expect(result!.componentCount).toBe(2)
    expect(result!.totalLow).toBeGreaterThan(0)
  })

  it("returns null on malformed input", () => {
    expect(estimateEarlyCost("mod-1", "Test", "no table here")).toBeNull()
  })

  it("returns null on empty string", () => {
    expect(estimateEarlyCost("mod-1", "Test", "")).toBeNull()
  })

  it("returns null when table has no dimensioned components", () => {
    const interfaceDef = `
=== b) COMPONENT PLACEMENT TABLE ===
| Component | Qty | Notes     |
|-----------|-----|-----------|
| Screw     | 10  | M3x8mm   |
| Washer    | 10  | M3        |

=== c) CONNECTION MAP ===
`
    expect(estimateEarlyCost("mod-1", "Test", interfaceDef)).toBeNull()
  })
})
