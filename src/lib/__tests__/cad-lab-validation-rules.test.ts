import type { CadLabModule } from "@/lib/cad-lab-types"
import { validateModule } from "@/lib/cad-lab/validation-rules"

// ─── Helpers ────────────────────────────────────────────────────────

function makeModule(overrides: Partial<CadLabModule>): CadLabModule {
  return {
    id: "test-mod",
    name: "Test Module",
    purpose: "Testing",
    inputs: [],
    outputs: [],
    keyParts: [],
    leadWeeks: 4,
    description: "",
    whyItMatters: "",
    failureModes: [],
    unknowns: [],
    status: "generated",
    result: {
      success: true,
      bbox: { xLen: 100, yLen: 80, zLen: 40 },
      massGrams: 200,
    },
    ...overrides,
  }
}

// ─── Bounding Box Rules ─────────────────────────────────────────────

describe("validateBoundingBox", () => {
  it("flags near-zero dimension as critical", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 100, yLen: 0.05, zLen: 40 } },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "geo-bbox-tiny-axis")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("critical")
  })

  it("flags oversized parts as warning", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 3000, yLen: 100, zLen: 100 } },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "geo-bbox-oversized")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("warning")
  })

  it("passes for normal dimensions", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 100, yLen: 80, zLen: 40 } },
    })
    const summary = validateModule(mod, {})
    const bboxIssues = summary.results.filter(r =>
      r.ruleId === "geo-bbox-tiny-axis" || r.ruleId === "geo-bbox-oversized",
    )
    expect(bboxIssues).toHaveLength(0)
  })
})

// ─── Build Volume ───────────────────────────────────────────────────

describe("validateProcessBuildVolume", () => {
  it("flags part exceeding FDM build volume", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 400, yLen: 400, zLen: 400 } },
    })
    const summary = validateModule(mod, { mfg_process: "FDM 3D Print" })
    const issue = summary.results.find(r => r.ruleId === "geo-build-volume")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("critical")
  })

  it("passes when part fits in at least one process variant", () => {
    // CNC maps to cnc-3axis (1200×800×600) and cnc-5axis (800×600×500)
    // 900mm part fits in 3axis but not 5axis — should pass
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 900, yLen: 500, zLen: 300 } },
    })
    const summary = validateModule(mod, { mfg_process: "CNC Machining" })
    const issue = summary.results.find(r => r.ruleId === "geo-build-volume")
    expect(issue).toBeUndefined()
  })

  it("emits only one failure for multi-variant process", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 2000, yLen: 2000, zLen: 2000 } },
    })
    const summary = validateModule(mod, { mfg_process: "CNC Machining" })
    const issues = summary.results.filter(r => r.ruleId === "geo-build-volume")
    // Source uses bestFit logic: checks all variants, emits single issue if none fit
    expect(issues).toHaveLength(1)
  })
})

// ─── Material-Process Compatibility ─────────────────────────────────

describe("validateMaterialProcessCompatibility", () => {
  it("flags incompatible material + process as critical", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "FDM 3D Print",
      material: "Titanium",
    })
    const issue = summary.results.find(r => r.ruleId === "compat-material-process")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("critical")
    expect(issue!.suggestion).toContain("Compatible processes")
  })

  it("passes for compatible combo (FDM + PLA/PETG)", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "FDM 3D Print",
      material: "PLA/PETG",
    })
    const issue = summary.results.find(r => r.ruleId === "compat-material-process")
    expect(issue).toBeUndefined()
  })

  it("passes for compatible combo (CNC + Aluminum)", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "CNC Machining",
      material: "Aluminum 6061",
    })
    const issue = summary.results.find(r => r.ruleId === "compat-material-process")
    expect(issue).toBeUndefined()
  })

  it("skips validation when diagnostics are missing", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "compat-material-process")
    expect(issue).toBeUndefined()
  })
})

// ─── Tolerance Feasibility ──────────────────────────────────────────

describe("validateToleranceFeasibility", () => {
  it("flags ultra-tight tolerance for FDM as critical", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "FDM 3D Print",
      tolerance: "Ultra-tight (±0.01mm)",
    })
    const issue = summary.results.find(r => r.ruleId === "tol-unachievable")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("critical")
  })

  it("flags precision tolerance for SLA as warning (achievable but premium)", () => {
    // SLA tolerance_standard=0.15, tolerance_tight=0.05
    // Precision (±0.1mm) → 0.1 >= tight=0.05 but < standard=0.15 → premium warning
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "SLA/Resin Print",
      tolerance: "Precision (±0.1mm)",
    })
    const issue = summary.results.find(r => r.ruleId === "tol-premium")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("warning")
  })

  it("passes loose tolerance for FDM", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "FDM 3D Print",
      tolerance: "Loose (±1mm)",
    })
    const tolIssues = summary.results.filter(r =>
      r.ruleId === "tol-unachievable" || r.ruleId === "tol-premium",
    )
    expect(tolIssues).toHaveLength(0)
  })
})

// ─── Mass Sanity ────────────────────────────────────────────────────

describe("validateMassSanity", () => {
  it("flags extremely light parts as warning", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 50, yLen: 50, zLen: 50 }, massGrams: 0.1 },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "struct-mass-low")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("warning")
  })

  it("skips mass-low check for label-type modules", () => {
    const mod = makeModule({
      name: "Product Label",
      result: { success: true, bbox: { xLen: 50, yLen: 20, zLen: 1 }, massGrams: 0.5 },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "struct-mass-low")
    expect(issue).toBeUndefined()
  })

  it("flags extremely heavy parts as warning", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 500, yLen: 500, zLen: 500 }, massGrams: 80000 },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "struct-mass-high")
    expect(issue).toBeDefined()
  })

  it("correctly derives mass from massProperties.massKg", () => {
    const mod = makeModule({
      result: {
        success: true,
        bbox: { xLen: 50, yLen: 50, zLen: 50 },
        massProperties: { massKg: 0.0005 },
      },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "struct-mass-low")
    expect(issue).toBeDefined()
    expect(issue!.measuredValue).toContain("0.50")
  })

  it("prefers massGrams over massProperties.massKg", () => {
    const mod = makeModule({
      result: {
        success: true,
        bbox: { xLen: 50, yLen: 50, zLen: 50 },
        massGrams: 200,
        massProperties: { massKg: 0.001 },
      },
    })
    const summary = validateModule(mod, {})
    const issue = summary.results.find(r => r.ruleId === "struct-mass-low")
    expect(issue).toBeUndefined() // 200g is fine
  })
})

// ─── Environment Compatibility ──────────────────────────────────────

describe("validateEnvironmentCompatibility", () => {
  it("flags PLA in outdoor environment as critical", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      material: "PLA/PETG",
      environment: "Outdoor",
    })
    const issue = summary.results.find(r => r.ruleId === "env-material-outdoor-pla")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("critical")
  })

  it("flags mild steel in marine environment as critical", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      material: "Steel (mild)",
      environment: "Wet/Marine",
    })
    const issue = summary.results.find(r => r.ruleId === "env-material-corrosion-steel")
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe("critical")
  })

  it("passes for indoor use with any material", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      material: "PLA/PETG",
      environment: "Indoor",
    })
    const envIssues = summary.results.filter(r => r.category === "environment")
    expect(envIssues).toHaveLength(0)
  })
})

// ─── Batch Economics ────────────────────────────────────────────────

describe("validateBatchEconomics", () => {
  it("flags small batch for injection molding", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "Injection Molding",
      batch_size: "1-10",
    })
    const issue = summary.results.find(r => r.ruleId === "econ-batch-small")
    expect(issue).toBeDefined()
    expect(issue!.category).toBe("economics")
  })

  it("flags high volume for FDM", () => {
    const mod = makeModule({})
    const summary = validateModule(mod, {
      mfg_process: "FDM 3D Print",
      batch_size: "5000-10000",
    })
    const issue = summary.results.find(r => r.ruleId === "econ-batch-additive-high")
    expect(issue).toBeDefined()
    expect(issue!.category).toBe("economics")
  })
})

// ─── Overall Verdict Logic ──────────────────────────────────────────

describe("validateModule verdict", () => {
  it("returns pass when no issues found", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 100, yLen: 80, zLen: 40 }, massGrams: 200 },
    })
    const summary = validateModule(mod, {})
    expect(summary.verdict).toBe("pass")
    expect(summary.criticalCount).toBe(0)
    expect(summary.warningCount).toBe(0)
  })

  it("returns fail when critical issues exist", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 0.01, yLen: 100, zLen: 40 } },
    })
    const summary = validateModule(mod, {})
    expect(summary.verdict).toBe("fail")
    expect(summary.criticalCount).toBeGreaterThan(0)
  })

  it("returns warn when only warnings exist (no criticals)", () => {
    const mod = makeModule({
      result: { success: true, bbox: { xLen: 100, yLen: 80, zLen: 40 }, massGrams: 80000 },
    })
    const summary = validateModule(mod, {})
    expect(summary.verdict).toBe("warn")
    expect(summary.criticalCount).toBe(0)
    expect(summary.warningCount).toBeGreaterThan(0)
  })

  it("returns empty results when module has no result data", () => {
    const mod = makeModule({ result: undefined })
    const summary = validateModule(mod, {})
    expect(summary.results).toHaveLength(0)
    expect(summary.verdict).toBe("pass")
  })
})
