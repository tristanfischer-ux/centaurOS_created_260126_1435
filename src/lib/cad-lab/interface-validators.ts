/**
 * @file interface-validators.ts — Deterministic validators for CAD Lab interface definitions.
 *
 * @description Pure functions that mechanically check interface definitions for errors
 * before code generation. These catch LLM hallucinations (wrong sums, missing dims,
 * invented numbers) that no amount of prompt engineering can prevent.
 *
 * Validators:
 * - #1 verifyInterfaceArithmetic — checks space budget sums
 * - #2 checkComponentCoverage — checks all interface components have make_*() functions
 * - #6 trackDimensionProvenance — checks interface dims trace back to research
 *
 * @security No auth required — pure computation on provided strings.
 */

import type { PreExecValidationResult } from "@/lib/cad-lab-types"

// ─── #1: Interface Arithmetic Verifier ───────────────────────────────

/**
 * Parses the SPACE BUDGET section and verifies that individual dimension
 * lines sum to the stated total. Catches LLM arithmetic hallucinations.
 *
 * @param interfaceDefinition - Full interface definition text from Step 2
 * @returns Validation results (warnings if sums don't match)
 */
export function verifyInterfaceArithmetic(
  interfaceDefinition: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // INTENT: Extract the SPACE BUDGET section (between === a) and === b))
  const budgetMatch = interfaceDefinition.match(
    /===\s*a\)\s*SPACE\s*BUDGET\s*===\s*([\s\S]*?)(?:===\s*b\)|$)/i,
  )
  if (!budgetMatch) return results

  const budgetText = budgetMatch[1]

  // INTENT: Scan the budget text line-by-line. Collect dimension values until
  // we hit a "Total" or "Sum" line, then verify the sum. This avoids the
  // split-at-total bug where dimension lines get separated from their totals.
  const lines = budgetText.split("\n")
  const pendingValues: number[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines, separators (─────, =====, -----)
    if (trimmed === "" || /^[─═\-]+$/.test(trimmed)) continue

    // Check if this is a "Total" or "Sum" line
    const totalMatch = trimmed.match(
      /^(?:Total|Sum)[^:]*:\s*(\d+(?:\.\d+)?)\s*mm/i,
    )
    if (totalMatch) {
      if (pendingValues.length >= 2) {
        const statedTotal = parseFloat(totalMatch[1])
        const computedSum = pendingValues.reduce((a, b) => a + b, 0)
        const diff = Math.abs(computedSum - statedTotal)

        // INTENT: Scale tolerance with object size — 0.5% of total or 1mm, whichever is larger.
        // Small objects: 1mm (same as before). Large objects (6058mm container): 30mm.
        if (diff > Math.max(1, statedTotal * 0.005)) {
          results.push({
            ruleId: "arith-sum-mismatch",
            severity: "warning",
            message: `Space budget sum mismatch: individual values add to ${computedSum}mm but total states ${statedTotal}mm (off by ${diff.toFixed(1)}mm)`,
            repairHint: `Recalculate the space budget total. The individual components sum to ${computedSum}mm, not ${statedTotal}mm. Fix either the individual values or the total.`,
            autoFixable: false,
          })
        }
      }
      // Reset for next potential group
      pendingValues.length = 0
      continue
    }

    // Otherwise, try to extract a dimension value
    const dimMatch = trimmed.match(/^[^─═\-][^:]*:\s*(\d+(?:\.\d+)?)\s*mm/i)
    if (dimMatch) {
      pendingValues.push(parseFloat(dimMatch[1]))
    }
  }

  return results
}

// ─── #2: Component Coverage Checker ──────────────────────────────────

/**
 * Checks that every component in the interface's Component Placement Table
 * has a corresponding make_*() function in the Python code. Uses fuzzy
 * keyword matching (>50% overlap) to handle naming variations.
 *
 * @param interfaceDefinition - Full interface definition text from Step 2
 * @param pythonCode - Generated CadQuery Python code
 * @returns Validation results (warnings for unmatched components)
 */
export function checkComponentCoverage(
  interfaceDefinition: string,
  pythonCode: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // INTENT: Extract component names from the placement table.
  // Table format: | Component | Qty | Dimensions | Position | Notes |
  const tableMatch = interfaceDefinition.match(
    /===\s*b\)\s*COMPONENT\s*PLACEMENT\s*TABLE\s*===\s*([\s\S]*?)(?:===\s*c\)|$)/i,
  )
  if (!tableMatch) return results

  const tableText = tableMatch[1]

  // Extract component names from table rows (first column after |)
  const componentNames: string[] = []
  const rowPattern = /^\s*\|\s*([^|]+?)\s*\|/gm
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowPattern.exec(tableText)) !== null) {
    const name = rowMatch[1].trim()
    // Skip header rows and separator rows
    if (
      name.toLowerCase() === "component" ||
      name.startsWith("-") ||
      name.startsWith("=") ||
      name.length === 0
    ) continue
    componentNames.push(name)
  }

  if (componentNames.length === 0) return results

  // Extract make_*() function names from Python code
  const funcPattern = /def\s+(make_\w+)\s*\(/g
  const funcNames: string[] = []
  let funcMatch: RegExpExecArray | null
  while ((funcMatch = funcPattern.exec(pythonCode)) !== null) {
    funcNames.push(funcMatch[1])
  }

  // INTENT: Fuzzy-match each component to a function using keyword overlap >50%
  const unmatched: string[] = []
  for (const component of componentNames) {
    const compWords = extractWords(component)
    if (compWords.size === 0) continue

    let bestOverlap = 0
    for (const func of funcNames) {
      // Convert make_motor_mount → ["motor", "mount"]
      const funcWords = extractWords(func.replace(/^make_/, "").replace(/_/g, " "))
      const overlap = computeOverlap(compWords, funcWords)
      if (overlap > bestOverlap) bestOverlap = overlap
    }

    if (bestOverlap < 0.5) {
      unmatched.push(component)
    }
  }

  if (unmatched.length > 0) {
    results.push({
      ruleId: "coverage-missing-component",
      severity: "warning",
      message: `${unmatched.length} interface component(s) have no matching make_*() function: ${unmatched.join(", ")}`,
      repairHint: `Add make_*() functions for these components: ${unmatched.join(", ")}. Each component in the interface placement table must have a corresponding function that builds its geometry.`,
      autoFixable: false,
    })
  }

  return results
}

// ─── #6: Dimension Provenance Tracker ────────────────────────────────

/**
 * Checks that numeric dimensions in the interface definition can be traced
 * back to the research report. Catches dimensions the LLM invented.
 *
 * @param researchReport - Research report from Step 1
 * @param interfaceDefinition - Interface definition from Step 2
 * @returns Validation results (warnings for unresearched dimensions)
 */
export function trackDimensionProvenance(
  researchReport: string,
  interfaceDefinition: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // Extract all numeric dimensions (Nmm pattern) from research
  const researchDims = extractDimensions(researchReport)
  if (researchDims.size === 0) return results // No research dims to compare against

  // Extract dimensions from interface
  const interfaceDims = extractDimensions(interfaceDefinition)
  if (interfaceDims.size === 0) return results

  // INTENT: Find interface dimensions that don't appear in research (within tolerance).
  // Skip small values (<5mm, likely clearances).
  // DECISION (B5): Round numbers (500mm, 1000mm) are NOT skipped — they are exactly
  // what LLMs hallucinate. Better to flag them and let the user verify.
  const unresearched: number[] = []
  for (const dim of interfaceDims) {
    if (dim < 5) continue // Skip small clearances/gaps

    let found = false
    for (const researchDim of researchDims) {
      // D2: Hybrid tolerance — 2mm absolute minimum / 2% relative.
      // Large dims get much tighter checks (6000mm: 120mm vs old 300mm).
      const tolerance = Math.max(2, researchDim * 0.02)
      if (Math.abs(dim - researchDim) <= tolerance) {
        found = true
        break
      }
    }
    if (!found) unresearched.push(dim)
  }

  if (unresearched.length > 0) {
    // INTENT: Only warn, don't block — derived values legitimately differ from research
    const dimList = unresearched.slice(0, 10).map((d) => `${d}mm`).join(", ")
    results.push({
      ruleId: "provenance-unresearched-dim",
      severity: "info",
      message: `${unresearched.length} interface dimension(s) not found in research report: ${dimList}${unresearched.length > 10 ? "..." : ""}`,
      repairHint: `Verify these dimensions against the research report. If they are derived values (sums, differences), ensure the source values are correct. If they are new dimensions, add a comment explaining the source.`,
    })
  }

  return results
}

// ─── B1: Interface Structure Validator ────────────────────────────────

/**
 * Checks that the interface definition contains all 4 required section markers.
 * Missing sections indicate the LLM skipped part of the template.
 *
 * @param interfaceDefinition - Full interface definition text from Step 2
 * @returns Validation results (warnings for missing sections)
 */
export function validateInterfaceStructure(
  interfaceDefinition: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  const requiredSections = [
    { marker: /===\s*a\)\s*SPACE\s*BUDGET\s*===/i, label: "a) SPACE BUDGET" },
    { marker: /===\s*b\)\s*COMPONENT\s*PLACEMENT\s*TABLE\s*===/i, label: "b) COMPONENT PLACEMENT TABLE" },
    { marker: /===\s*c\)\s*CONNECTION\s*MAP\s*===/i, label: "c) CONNECTION MAP" },
    { marker: /===\s*d\)\s*VALIDATION\s*CHECKLIST\s*===/i, label: "d) VALIDATION CHECKLIST" },
  ]

  const missing: string[] = []
  for (const section of requiredSections) {
    if (!section.marker.test(interfaceDefinition)) {
      missing.push(section.label)
    }
  }

  if (missing.length > 0) {
    results.push({
      ruleId: "iface-missing-section",
      severity: "warning",
      message: `Interface definition missing ${missing.length} required section(s): ${missing.join(", ")}`,
      repairHint: `The interface definition must contain all 4 sections: === a) SPACE BUDGET ===, === b) COMPONENT PLACEMENT TABLE ===, === c) CONNECTION MAP ===, === d) VALIDATION CHECKLIST ===. Add the missing section(s).`,
    })
  }

  return results
}

// ─── F5: Dimension Conflict Detector ──────────────────────────────────

/**
 * Scans a research report for same-label dimensions with conflicting values.
 * E.g. "motor diameter: 30mm" vs "motor diameter: 34mm" — >5% difference
 * indicates ambiguous sources that may confuse code generation.
 *
 * @param researchReport - Research report text from Step 1
 * @returns Validation results (info severity — advisory only)
 */
export function detectDimensionConflicts(
  researchReport: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []
  if (!researchReport) return results

  // INTENT: Extract labeled dimensions — "label: Nmm" or "label = Nmm" patterns
  // Labels are 1–4 words (prevents greedy capture of preceding prose)
  const dimPattern = /([a-z][a-z0-9_]*(?:[\s_-][a-z][a-z0-9_]*){0,3})\s*(?::|=|is)\s*(?:~|≈|about|approximately)?\s*(\d+(?:\.\d+)?)\s*mm\b/gi
  const labelMap = new Map<string, number[]>()

  let match: RegExpExecArray | null
  while ((match = dimPattern.exec(researchReport)) !== null) {
    const rawLabel = match[1].trim().toLowerCase().replace(/[\s_-]+/g, " ")
    // INTENT: Normalize to last 3 words to avoid capturing preceding prose
    // "testing shows motor diameter" → "shows motor diameter" → still noisy
    // Take last 2 words as canonical label for comparison
    const words = rawLabel.split(" ")
    const label = words.length > 2 ? words.slice(-2).join(" ") : rawLabel
    const value = parseFloat(match[2])
    if (value < 1) continue // Skip sub-mm values
    const existing = labelMap.get(label) ?? []
    existing.push(value)
    labelMap.set(label, existing)
  }

  // Find labels with conflicting values (>5% difference between min and max)
  const conflicts: string[] = []
  for (const [label, values] of labelMap) {
    if (values.length < 2) continue
    const unique = [...new Set(values)]
    if (unique.length < 2) continue
    const min = Math.min(...unique)
    const max = Math.max(...unique)
    if (min > 0 && (max - min) / min > 0.05) {
      conflicts.push(`"${label}": ${unique.map((v) => `${v}mm`).join(" vs ")}`)
    }
  }

  if (conflicts.length > 0) {
    results.push({
      ruleId: "research-dimension-conflict",
      severity: "info",
      message: `${conflicts.length} dimension label(s) have conflicting values in research: ${conflicts.slice(0, 5).join("; ")}`,
      repairHint: `The research report contains conflicting values for the same dimension. Verify which value is correct before using in the interface definition: ${conflicts.slice(0, 5).join("; ")}`,
    })
  }

  return results
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extracts significant words from a string for fuzzy matching */
function extractWords(text: string): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "to", "of", "for", "from", "in", "on", "at",
    "and", "or", "with", "by", "main", "sub", "top", "bottom",
  ])
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stopWords.has(w)),
  )
}

/** Computes Jaccard-like overlap between two word sets */
function computeOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) {
    if (b.has(w)) shared++
  }
  // Use the smaller set as denominator for asymmetric matching
  return shared / Math.min(a.size, b.size)
}

/** Extracts all Nmm numeric values from text */
function extractDimensions(text: string): Set<number> {
  const dims = new Set<number>()
  // Match patterns like "123mm", "123.5mm", "123 mm"
  const pattern = /(\d+(?:\.\d+)?)\s*mm\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    dims.add(parseFloat(match[1]))
  }
  return dims
}

