/**
 * @file validation-rules.ts — Automated design validation rule engine.
 *
 * @description Data-driven validation rules that catch physically impossible or
 * unmanufacturable designs before specialist review. Rules are backed by the
 * engineering database (processes.ts, materials.ts) — not hardcoded guesses.
 *
 * @security No auth required — pure computation on provided data.
 *
 * @related
 * - Validation runner: src/lib/cad-lab/validation-runner.ts
 * - Process database: src/lib/engineering-data/processes.ts
 * - Material database: src/lib/engineering-data/materials.ts
 * - Quality scorecard: src/lib/cad-lab-quality-scorecard.ts
 */

import { PROCESSES } from "@/lib/engineering-data/processes"
import { MATERIALS } from "@/lib/engineering-data/materials"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ──────────────────────────────────────────────────────────

export type ValidationSeverity = "critical" | "warning" | "info"

export interface ValidationResult {
  /** Unique rule ID (e.g., "geo-min-wall") */
  ruleId: string
  /** Rule category */
  category: ValidationCategory
  /** Severity of the finding */
  severity: ValidationSeverity
  /** Human-readable message */
  message: string
  /** Actionable suggestion to fix */
  suggestion?: string
  /** Measured value that triggered the rule */
  measuredValue?: string
  /** Threshold or constraint that was violated */
  threshold?: string
}

export type ValidationCategory =
  | "geometry"
  | "material-process"
  | "tolerance"
  | "structural"
  | "environment"
  | "economics"

export interface ValidationSummary {
  /** Overall verdict */
  verdict: "pass" | "warn" | "fail"
  /** Count of critical issues */
  criticalCount: number
  /** Count of warnings */
  warningCount: number
  /** Count of informational notes */
  infoCount: number
  /** All validation results */
  results: ValidationResult[]
  /** Module that was validated */
  moduleId: string
  /** When validation ran */
  validatedAt: string
}

/** Diagnostic answers for a single module (questionId → answer string) */
type ModuleDiagnostics = Record<string, string>

// ─── Diagnostic-to-DB Mapping ───────────────────────────────────────

/**
 * Maps diagnostic process selection strings to engineering DB process IDs.
 *
 * INTENT: The diagnostics UI uses human-friendly names ("FDM 3D Print").
 * The engineering DB uses machine IDs ("fdm"). This bridges them.
 */
const DIAG_PROCESS_TO_DB_IDS: Record<string, string[]> = {
  "FDM 3D Print": ["fdm"],
  "SLA/Resin Print": ["sla"],
  "SLS/Powder Print": ["sls", "mjf"],
  "CNC Machining": ["cnc-3axis", "cnc-5axis"],
  "Sheet Metal": ["sheet-metal"],
  "Injection Molding": ["injection-molding"],
  "Casting": ["die-casting", "investment-casting", "sand-casting"],
  "Manual/Assembly": [],
  "Other": [],
}

/**
 * Maps diagnostic material selection strings to engineering DB material IDs.
 */
const DIAG_MATERIAL_TO_DB_IDS: Record<string, string[]> = {
  "PLA/PETG": ["pla", "petg"],
  "ABS/Nylon": ["abs", "nylon-pa6", "nylon-pa12"],
  "Resin (standard)": [], // DECISION: No matching IDs in materials DB for resins
  "Aluminum 6061": ["al-6061-t6"],
  "Steel (mild)": ["steel-1018", "steel-4140"],
  "Stainless Steel": ["ss-304", "ss-316"],
  "Titanium": ["ti-6al-4v"],
  "Copper/Brass": ["cu-c110", "brass-c360"],
  "Carbon Fiber": ["cf-unidirectional", "cf-woven-3k", "cf-chopped-sls"],
  "Wood/Plywood": [],
  "Other": [],
}

/**
 * Maps diagnostic tolerance class to a numeric value in mm.
 */
const DIAG_TOLERANCE_TO_MM: Record<string, number> = {
  "Loose (±1mm)": 1.0,
  "Standard (±0.5mm)": 0.5,
  "Precision (±0.1mm)": 0.1,
  "Tight (±0.05mm)": 0.05,
  "Ultra-tight (±0.01mm)": 0.01,
}

// ─── Rule Definitions ───────────────────────────────────────────────

/**
 * Validate minimum wall thickness against process constraints.
 *
 * INTENT: If the diagnostic says "FDM" and the DFM reports a 0.5mm wall,
 * that's below FDM's 0.8mm minimum → critical fail.
 */
function validateMinWallThickness(
  module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []
  const dfm = module.result?.dfm
  if (!dfm) return results

  const processName = diagnostics.mfg_process
  if (!processName) return results

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  if (processIds.length === 0) return results

  // Use the most permissive (smallest min_wall) process in the group
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  if (processes.length === 0) return results

  const minWallLimit = Math.min(...processes.map(p => p.min_wall_mm))

  // Check DFM issues for thin wall warnings
  const thinWallIssues = dfm.issues.filter(
    i => i.category.toLowerCase().includes("wall") || i.message.toLowerCase().includes("wall thickness"),
  )

  for (const issue of thinWallIssues) {
    // Try to extract wall measurement from the message
    const wallMatch = issue.message.match(/([\d.]+)\s*mm/)
    if (wallMatch) {
      const wallMm = parseFloat(wallMatch[1])
      if (wallMm < minWallLimit) {
        results.push({
          ruleId: "geo-min-wall",
          category: "geometry",
          severity: "critical",
          message: `Wall thickness ${wallMm}mm is below ${processName} minimum of ${minWallLimit}mm`,
          suggestion: `Increase wall thickness to at least ${minWallLimit}mm or switch to a process with thinner wall capability (e.g., SLA: 0.5mm, DMLS: 0.4mm)`,
          measuredValue: `${wallMm}mm`,
          threshold: `${minWallLimit}mm min`,
        })
      }
    }
  }

  return results
}

/**
 * Validate bounding box for sanity — catch missing geometry or absurdly
 * large/small parts.
 */
function validateBoundingBox(
  module: CadLabModule,
  _diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []
  const bbox = module.result?.bbox
  if (!bbox) return results

  const { xLen, yLen, zLen } = bbox
  const dims = [xLen, yLen, zLen]

  // INTENT: Catch parts that are basically a point — likely missing geometry
  if (dims.some(d => d < 0.1)) {
    results.push({
      ruleId: "geo-bbox-tiny-axis",
      category: "geometry",
      severity: "critical",
      message: `Bounding box has a near-zero dimension (${xLen.toFixed(1)} × ${yLen.toFixed(1)} × ${zLen.toFixed(1)} mm) — geometry may be missing`,
      suggestion: "Check that the CadQuery code generates 3D geometry, not just a 2D sketch",
      measuredValue: `${xLen.toFixed(1)} × ${yLen.toFixed(1)} × ${zLen.toFixed(1)} mm`,
      threshold: "All axes > 0.1mm",
    })
  }

  // INTENT: Catch absurdly large parts (>2000mm on any axis)
  if (dims.some(d => d > 2000)) {
    results.push({
      ruleId: "geo-bbox-oversized",
      category: "geometry",
      severity: "warning",
      message: `Part is very large (${xLen.toFixed(0)} × ${yLen.toFixed(0)} × ${zLen.toFixed(0)} mm) — may exceed build volume for most processes`,
      suggestion: "Verify dimensions are in mm (not meters). Check if the part fits the selected manufacturing process build volume.",
      measuredValue: `${xLen.toFixed(0)} × ${yLen.toFixed(0)} × ${zLen.toFixed(0)} mm`,
      threshold: "<2000mm per axis",
    })
  }

  // INTENT: Check against specific process build volume
  return results
}

/**
 * Validate that the part fits within the selected process's build volume.
 */
function validateProcessBuildVolume(
  module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []
  const bbox = module.result?.bbox
  if (!bbox) return results

  const processName = diagnostics.mfg_process
  if (!processName) return results

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  if (processIds.length === 0) return results

  // Use the largest build volume in the group
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  if (processes.length === 0) return results

  // DECISION: Sort part dims largest-first and check against sorted build volume.
  // This allows rotation to fit.
  const partDims = [bbox.xLen, bbox.yLen, bbox.zLen].sort((a, b) => b - a)

  // DECISION: Check against the LARGEST build volume in the process group.
  // e.g. "CNC Machining" maps to both cnc-3axis and cnc-5axis — the part only
  // needs to fit in ONE of them, not all.
  let bestFit = false
  let bestProc = processes[0]
  let bestBuildDims = [0, 0, 0]

  for (const proc of processes) {
    const buildDims = [
      proc.max_part_size_mm.x,
      proc.max_part_size_mm.y,
      proc.max_part_size_mm.z,
    ].sort((a, b) => b - a)

    if (partDims.every((d, i) => d <= buildDims[i])) {
      bestFit = true
      break
    }

    // Track the process with the largest volume for the error message
    const volume = buildDims[0] * buildDims[1] * buildDims[2]
    const bestVolume = bestBuildDims[0] * bestBuildDims[1] * bestBuildDims[2]
    if (volume > bestVolume) {
      bestProc = proc
      bestBuildDims = buildDims
    }
  }

  if (!bestFit) {
    results.push({
      ruleId: "geo-build-volume",
      category: "geometry",
      severity: "critical",
      message: `Part (${partDims.map(d => d.toFixed(0)).join("×")}mm) exceeds ${bestProc.name} build volume (${bestBuildDims.map(d => d.toFixed(0)).join("×")}mm)`,
      suggestion: `Consider splitting the part, selecting a larger-format process, or reducing part size`,
      measuredValue: `${partDims.map(d => d.toFixed(0)).join("×")}mm`,
      threshold: `${bestBuildDims.map(d => d.toFixed(0)).join("×")}mm`,
    })
  }

  return results
}

/**
 * Validate volume fill ratio — catch solid blocks (fill >95%) or
 * hollow shells with missing geometry (fill <2%).
 */
function validateFillRatio(
  module: CadLabModule,
  _diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []
  const fillRatio = module.result?.fillRatio
  if (fillRatio == null) return results

  if (fillRatio > 95) {
    results.push({
      ruleId: "geo-fill-solid",
      category: "geometry",
      severity: "warning",
      message: `Volume fill ratio is ${fillRatio.toFixed(0)}% — part appears to be a solid block with minimal features`,
      suggestion: "Check that pockets, holes, and internal features are included in the geometry",
      measuredValue: `${fillRatio.toFixed(0)}%`,
      threshold: "<95%",
    })
  }

  if (fillRatio < 2) {
    results.push({
      ruleId: "geo-fill-hollow",
      category: "geometry",
      severity: "warning",
      message: `Volume fill ratio is very low (${fillRatio.toFixed(1)}%) — geometry may be incomplete or shell-only`,
      suggestion: "Verify the part has solid features and not just a thin shell",
      measuredValue: `${fillRatio.toFixed(1)}%`,
      threshold: ">2%",
    })
  }

  return results
}

/**
 * Validate material-process compatibility.
 *
 * INTENT: If someone selects "Titanium" + "FDM 3D Print", that's impossible.
 * Cross-reference the diagnostic selections against the process constraint
 * tables' compatible_materials lists.
 */
function validateMaterialProcessCompatibility(
  _module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []

  const processName = diagnostics.mfg_process
  const materialName = diagnostics.material
  if (!processName || !materialName) return results

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  const materialIds = DIAG_MATERIAL_TO_DB_IDS[materialName] ?? []

  // Can't validate if we don't have mappings
  if (processIds.length === 0 || materialIds.length === 0) return results

  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  if (processes.length === 0) return results

  // INTENT: Check if ANY of the material IDs are compatible with ANY
  // of the process variants
  const compatible = processes.some(proc =>
    materialIds.some(matId =>
      proc.compatible_materials.includes(matId),
    ),
  )

  if (!compatible) {
    // Find what processes CAN handle this material
    const altProcesses = PROCESSES.filter(p =>
      materialIds.some(matId => p.compatible_materials.includes(matId)),
    )
    const altNames = altProcesses.slice(0, 3).map(p => p.name).join(", ")

    results.push({
      ruleId: "compat-material-process",
      category: "material-process",
      severity: "critical",
      message: `${materialName} is not compatible with ${processName}`,
      suggestion: altNames
        ? `Compatible processes for ${materialName}: ${altNames}`
        : `Check material/process selection — this combination is not feasible`,
      measuredValue: `${materialName} + ${processName}`,
      threshold: "Must be in process compatible_materials list",
    })
  }

  return results
}

/**
 * Validate that the requested tolerance class is achievable with the
 * selected manufacturing process.
 */
function validateToleranceFeasibility(
  _module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []

  const processName = diagnostics.mfg_process
  const toleranceClass = diagnostics.tolerance
  if (!processName || !toleranceClass) return results

  const requestedMm = DIAG_TOLERANCE_TO_MM[toleranceClass]
  if (requestedMm == null) return results

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  if (processes.length === 0) return results

  // INTENT: Use the best (tightest tolerance) achievable by the process group
  const bestStandard = Math.min(...processes.map(p => p.tolerance_standard_mm))
  const bestTight = Math.min(...processes.map(p => p.tolerance_tight_mm))

  if (requestedMm < bestTight) {
    results.push({
      ruleId: "tol-unachievable",
      category: "tolerance",
      severity: "critical",
      message: `Requested tolerance ±${requestedMm}mm is tighter than ${processName} can achieve (best: ±${bestTight}mm with premium cost)`,
      suggestion: `Relax tolerance to ±${bestTight}mm, or switch to a higher-precision process (CNC 5-axis: ±0.005mm, Wire EDM: ±0.002mm)`,
      measuredValue: `±${requestedMm}mm`,
      threshold: `±${bestTight}mm (tight), ±${bestStandard}mm (standard)`,
    })
  } else if (requestedMm < bestStandard) {
    results.push({
      ruleId: "tol-premium",
      category: "tolerance",
      severity: "warning",
      message: `Requested tolerance ±${requestedMm}mm requires premium processing for ${processName} (standard: ±${bestStandard}mm)`,
      suggestion: `This tolerance is achievable but will increase cost. Consider if ±${bestStandard}mm is sufficient.`,
      measuredValue: `±${requestedMm}mm`,
      threshold: `±${bestStandard}mm (standard)`,
    })
  }

  return results
}

/**
 * Validate mass sanity — catch impossibly light or heavy parts.
 */
function validateMassSanity(
  module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []

  // GOTCHA: Explicit intermediates to avoid ?? / ternary precedence bug
  const rawMassGrams = module.result?.massGrams
  const rawMassKg = module.result?.massProperties?.massKg
  const massGrams = rawMassGrams != null ? rawMassGrams
    : rawMassKg != null ? rawMassKg * 1000
    : null
  if (massGrams == null) return results

  // INTENT: Structural parts under 1g are suspicious (probably wrong density/volume)
  if (massGrams < 1 && !module.name.toLowerCase().includes("label") && !module.name.toLowerCase().includes("decal")) {
    results.push({
      ruleId: "struct-mass-low",
      category: "economics",
      severity: "warning",
      message: `Part mass is extremely low (${massGrams.toFixed(2)}g) — may indicate missing geometry or incorrect material density`,
      suggestion: "Check that material density is set correctly and that the model is solid (not just surfaces)",
      measuredValue: `${massGrams.toFixed(2)}g`,
      threshold: ">1g for structural parts",
    })
  }

  // INTENT: >50kg is likely wrong for a single module (not a full assembly)
  if (massGrams > 50000) {
    results.push({
      ruleId: "struct-mass-high",
      category: "economics",
      severity: "warning",
      message: `Part mass is ${(massGrams / 1000).toFixed(1)}kg — unusually heavy for a single module`,
      suggestion: "Verify dimensions are in mm and material density is correct. Consider if this should be decomposed into sub-modules.",
      measuredValue: `${(massGrams / 1000).toFixed(1)}kg`,
      threshold: "<50kg per module",
    })
  }

  return results
}

/**
 * Validate environment-material compatibility.
 *
 * INTENT: Outdoor use + PLA = bad. Corrosive environment + mild steel = bad.
 * High temperature + standard resin = bad.
 */
function validateEnvironmentCompatibility(
  _module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []

  const environment = diagnostics.environment
  const materialName = diagnostics.material
  if (!environment || !materialName) return results

  const materialIds = DIAG_MATERIAL_TO_DB_IDS[materialName] ?? []
  const materialIndex = new Map(MATERIALS.map(m => [m.id, m]))

  // Gather material properties for all matching IDs
  const mats = materialIds
    .map(id => materialIndex.get(id))
    .filter(Boolean) as (typeof MATERIALS)[number][]

  // INTENT: PLA/PETG outdoor — UV degradation + low HDT
  if (
    (environment.includes("Outdoor") || environment === "High temperature") &&
    materialName === "PLA/PETG"
  ) {
    const hdt = mats.find(m => m.hdt_c != null)?.hdt_c
    results.push({
      ruleId: "env-material-outdoor-pla",
      category: "environment",
      severity: "critical",
      message: `PLA/PETG is not suitable for ${environment} — degrades under UV exposure${hdt ? ` and softens above ${hdt}°C` : ""}`,
      suggestion: "Use ASA, PETG (if only outdoor, not high-temp), or ABS for outdoor applications. For high temperature, consider Nylon, PEEK, or metal.",
      measuredValue: materialName,
      threshold: `UV-stable, heat-resistant material for ${environment}`,
    })
  }

  // INTENT: Resin outdoor — UV degradation
  if (
    environment.includes("Outdoor") &&
    materialName === "Resin (standard)"
  ) {
    results.push({
      ruleId: "env-material-outdoor-resin",
      category: "environment",
      severity: "critical",
      message: "Standard resin degrades under prolonged UV exposure — not suitable for outdoor use",
      suggestion: "Use UV-resistant resin formulations or switch to a more durable material (ABS, Nylon, metal)",
      measuredValue: materialName,
      threshold: "UV-stable material for outdoor use",
    })
  }

  // INTENT: Mild steel in corrosive/marine environment
  if (
    (environment === "Wet/Marine" || environment === "Corrosive") &&
    materialName === "Steel (mild)"
  ) {
    results.push({
      ruleId: "env-material-corrosion-steel",
      category: "environment",
      severity: "critical",
      message: `Mild steel will corrode rapidly in ${environment} environment without coating`,
      suggestion: "Use stainless steel (304/316), aluminum, or add a protective coating (galvanizing, powder coat, epoxy)",
      measuredValue: materialName,
      threshold: `Corrosion-resistant material for ${environment}`,
    })
  }

  // INTENT: High temperature + polymers — check HDT
  if (environment === "High temperature") {
    for (const mat of mats) {
      if (mat.category === "polymer" && mat.hdt_c != null && mat.hdt_c < 100) {
        results.push({
          ruleId: "env-material-hightemp-polymer",
          category: "environment",
          severity: "warning",
          message: `${mat.name} has a heat deflection temperature of only ${mat.hdt_c}°C — may not survive high-temperature operation`,
          suggestion: "For high temperature applications, consider PEEK (HDT 152°C), PEI/Ultem (HDT 200°C), or metal",
          measuredValue: `HDT ${mat.hdt_c}°C`,
          threshold: "HDT >100°C for high-temperature use",
        })
      }
    }
  }

  return results
}

/**
 * Validate batch size vs process economics.
 *
 * INTENT: Injection molding 5 parts = waste of $5k-$100k tooling.
 * FDM 10,000 parts = absurdly slow and expensive.
 */
function validateBatchEconomics(
  _module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []

  const processName = diagnostics.mfg_process
  const batchStr = diagnostics.batch_size
  if (!processName || !batchStr) return results

  // Parse batch midpoint
  const batchMatch = batchStr.match(/(\d+)[–-](\d+)/)
  const singleMatch = batchStr.match(/(\d+)\+/)
  let batchMid: number
  if (batchMatch) {
    batchMid = Math.round((parseInt(batchMatch[1]) + parseInt(batchMatch[2])) / 2)
  } else if (singleMatch) {
    batchMid = parseInt(singleMatch[1])
  } else {
    return results
  }

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  if (processes.length === 0) return results

  // Use the most representative process
  const proc = processes[0]

  // INTENT: Batch too small for process that needs expensive tooling
  if (batchMid < proc.min_batch_economical) {
    results.push({
      ruleId: "econ-batch-small",
      category: "economics",
      severity: "warning",
      message: `Batch size ~${batchMid} is below ${proc.name} economical minimum of ${proc.min_batch_economical} units`,
      suggestion: proc.setup_cost_usd.high > 1000
        ? `Tooling costs $${proc.setup_cost_usd.low.toLocaleString()}-$${proc.setup_cost_usd.high.toLocaleString()} — consider prototyping with a lower-setup process first`
        : `Consider if the per-unit cost at this volume justifies ${proc.name}`,
      measuredValue: `~${batchMid} units`,
      threshold: `≥${proc.min_batch_economical} units`,
    })
  }

  // INTENT: FDM/SLA at mass production scale — bad idea
  if (batchMid > 1000 && proc.category === "additive" && proc.id !== "binder-jetting") {
    results.push({
      ruleId: "econ-batch-additive-high",
      category: "economics",
      severity: "warning",
      message: `${proc.name} at ${batchMid}+ units is cost-ineffective — additive manufacturing has high per-unit cost`,
      suggestion: "For 1000+ units, consider injection molding, die casting, or sheet metal stamping for significantly lower per-unit cost",
      measuredValue: `~${batchMid} units`,
      threshold: `<${proc.min_batch_economical > 1 ? proc.min_batch_economical * 100 : 1000} for additive`,
    })
  }

  return results
}

/**
 * Validate DFM overhang issues for additive processes.
 *
 * INTENT: Overhangs >45deg on FDM/DMLS need supports → cost + surface quality.
 */
function validateOverhangs(
  module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []
  const dfm = module.result?.dfm
  if (!dfm) return results

  const processName = diagnostics.mfg_process
  if (!processName) return results

  // Only relevant for additive processes
  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  const isAdditive = processes.some(p => p.category === "additive")
  if (!isAdditive) return results

  // Check DFM for overhang/support-related issues
  const overhangIssues = dfm.issues.filter(
    i =>
      i.message.toLowerCase().includes("overhang") ||
      i.message.toLowerCase().includes("support"),
  )

  // High support volume percentage
  if (dfm.supportVolumePct > 30) {
    results.push({
      ruleId: "geo-overhang-heavy",
      category: "geometry",
      severity: "warning",
      message: `Support volume is ${dfm.supportVolumePct.toFixed(0)}% of part volume — high support usage increases cost and degrades surface finish`,
      suggestion: "Re-orient the part to reduce overhangs, add self-supporting angles (≤45°), or use SLS/MJF which requires no supports",
      measuredValue: `${dfm.supportVolumePct.toFixed(0)}%`,
      threshold: "<30% support volume",
    })
  }

  return results
}

/**
 * Validate draft angles for formative processes.
 *
 * INTENT: Injection molding and die casting require draft angles for mold
 * release. If diagnostics specify these processes, flag it as a reminder.
 */
function validateDraftAngles(
  _module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []

  const processName = diagnostics.mfg_process
  if (!processName) return results

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  const requiresDraft = processes.filter(p => p.draft_angle_deg != null)
  if (requiresDraft.length === 0) return results

  const maxDraft = Math.max(...requiresDraft.map(p => p.draft_angle_deg!))

  results.push({
    ruleId: "geo-draft-required",
    category: "geometry",
    severity: "info",
    message: `${processName} requires minimum ${maxDraft}° draft angle on vertical surfaces for mold release`,
    suggestion: `Ensure all vertical walls have at least ${maxDraft}° draft. Textured surfaces need additional draft (add 1° per 0.025mm texture depth).`,
    measuredValue: "Not auto-checked",
    threshold: `≥${maxDraft}° draft`,
  })

  return results
}

/**
 * Validate min feature size against process constraints.
 */
function validateMinFeatureSize(
  module: CadLabModule,
  diagnostics: ModuleDiagnostics,
): ValidationResult[] {
  const results: ValidationResult[] = []
  const dfm = module.result?.dfm
  if (!dfm) return results

  const processName = diagnostics.mfg_process
  if (!processName) return results

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName] ?? []
  const processes = processIds
    .map(id => PROCESSES.find(p => p.id === id))
    .filter(Boolean) as (typeof PROCESSES)[number][]

  if (processes.length === 0) return results

  const minFeature = Math.min(...processes.map(p => p.min_feature_mm))

  // Check DFM for feature size warnings
  const featureIssues = dfm.issues.filter(
    i =>
      i.message.toLowerCase().includes("feature") ||
      i.message.toLowerCase().includes("detail") ||
      i.message.toLowerCase().includes("thin"),
  )

  for (const issue of featureIssues) {
    const sizeMatch = issue.message.match(/([\d.]+)\s*mm/)
    if (sizeMatch) {
      const featureMm = parseFloat(sizeMatch[1])
      if (featureMm < minFeature) {
        results.push({
          ruleId: "geo-min-feature",
          category: "geometry",
          severity: "warning",
          message: `Feature size ${featureMm}mm is below ${processName} minimum of ${minFeature}mm`,
          suggestion: `Increase feature size to at least ${minFeature}mm or select a higher-resolution process`,
          measuredValue: `${featureMm}mm`,
          threshold: `${minFeature}mm min`,
        })
      }
    }
  }

  return results
}

// ─── Rule Registry ──────────────────────────────────────────────────

/**
 * All validation rules, executed in order.
 *
 * DECISION: Rules are plain functions, not classes with a register pattern.
 * Simpler to read, debug, and extend. Each function checks its own
 * prerequisites (returns [] if data is missing).
 */
type ValidationRule = (
  module: CadLabModule,
  diagnostics: ModuleDiagnostics,
) => ValidationResult[]

export const VALIDATION_RULES: ValidationRule[] = [
  // Geometry rules
  validateBoundingBox,
  validateFillRatio,
  validateProcessBuildVolume,
  validateMinWallThickness,
  validateMinFeatureSize,
  validateOverhangs,
  validateDraftAngles,
  // Material-process compatibility
  validateMaterialProcessCompatibility,
  // Tolerance feasibility
  validateToleranceFeasibility,
  // Structural sanity
  validateMassSanity,
  // Environment compatibility
  validateEnvironmentCompatibility,
  // Economics
  validateBatchEconomics,
]

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Run all validation rules against a module and its diagnostics.
 *
 * @param module - The CAD Lab module with generation results
 * @param diagnostics - Diagnostic answers for this module (questionId → answer)
 * @returns Structured validation summary with verdict, counts, and details
 */
export function validateModule(
  module: CadLabModule,
  diagnostics: ModuleDiagnostics = {},
): ValidationSummary {
  const results: ValidationResult[] = []

  for (const rule of VALIDATION_RULES) {
    try {
      results.push(...rule(module, diagnostics))
    } catch (err) {
      // INTENT: Never let a single rule crash the entire validation pipeline
      console.error(`[VALIDATION] Rule failed:`, err)
    }
  }

  const criticalCount = results.filter(r => r.severity === "critical").length
  const warningCount = results.filter(r => r.severity === "warning").length
  const infoCount = results.filter(r => r.severity === "info").length

  let verdict: "pass" | "warn" | "fail"
  if (criticalCount > 0) {
    verdict = "fail"
  } else if (warningCount > 0) {
    verdict = "warn"
  } else {
    verdict = "pass"
  }

  return {
    verdict,
    criticalCount,
    warningCount,
    infoCount,
    results,
    moduleId: module.id,
    validatedAt: new Date().toISOString(),
  }
}
