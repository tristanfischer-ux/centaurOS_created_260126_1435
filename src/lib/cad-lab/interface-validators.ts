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

        if (diff > 1) {
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

  // INTENT: Find interface dimensions that don't appear in research (within 5% tolerance).
  // Skip small values (<5mm, likely clearances) and very round numbers (100, 500, 1000).
  const unresearched: number[] = []
  for (const dim of interfaceDims) {
    if (dim < 5) continue // Skip small clearances/gaps
    if (isVeryRoundNumber(dim)) continue // Skip standard round values

    let found = false
    for (const researchDim of researchDims) {
      const tolerance = researchDim * 0.05
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

/** Returns true for very round numbers that are likely standards, not researched */
function isVeryRoundNumber(n: number): boolean {
  // Exact multiples of 100 ≥ 100 (100, 200, 500, 1000, etc.)
  return n >= 100 && n % 100 === 0
}
