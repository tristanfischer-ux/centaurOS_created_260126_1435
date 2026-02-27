/**
 * @file code-validators.ts — Deterministic validators for generated CadQuery Python code.
 *
 * @description Pure functions that mechanically check generated CadQuery code for errors
 * before Modal execution. These catch structural issues that waste expensive Modal runs.
 *
 * Validators:
 * - #3 scanParametricIntegrity — catches hardcoded derived values
 * - #4 validateZStack — catches height mismatches between code and interface
 * - #5 analyzeCadQueryCode — catches forbidden/risky CadQuery operations
 *
 * @security No auth required — pure computation on provided strings.
 */

import type { PreExecValidationResult } from "@/lib/cad-lab-types"

// ─── #3: Parametric Integrity Scanner ────────────────────────────────

/**
 * Scans for lines in DERIVED sections that are direct numeric assignments
 * instead of expressions. Hardcoded derived values break parametric intent.
 *
 * @param pythonCode - Generated CadQuery Python code
 * @returns Validation results (warnings for hardcoded derived values)
 */
export function scanParametricIntegrity(
  pythonCode: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // INTENT: Find sections marked as "derived" or "calculated" and check
  // that assignments use expressions, not bare numbers.
  const lines = pythonCode.split("\n")
  let inDerivedSection = false
  const hardcodedLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect derived/calculated section headers (comments)
    if (/^#.*(?:derived|calculated|computed)/i.test(trimmed)) {
      inDerivedSection = true
      continue
    }

    // Exit derived section on next section header or blank line after content
    if (inDerivedSection && /^#\s*[-─═]/.test(trimmed)) {
      inDerivedSection = false
      continue
    }

    if (!inDerivedSection) continue

    // Check for bare numeric assignments: `width = 315` (not `width = count * h + gap`)
    // Pattern: identifier = number (no operators, no function calls, no other identifiers)
    const assignMatch = trimmed.match(
      /^(\w+)\s*=\s*(\d+(?:\.\d+)?)\s*(?:#.*)?$/,
    )
    if (assignMatch) {
      const varName = assignMatch[1]
      const value = assignMatch[2]
      // Skip common primary parameter names that are legitimately hardcoded
      if (isPrimaryParam(varName)) continue
      hardcodedLines.push(`${varName} = ${value} (line ${i + 1})`)
    }
  }

  if (hardcodedLines.length > 0) {
    results.push({
      ruleId: "param-hardcoded-derived",
      severity: "warning",
      message: `${hardcodedLines.length} derived value(s) appear hardcoded instead of computed from parameters: ${hardcodedLines.slice(0, 5).join("; ")}`,
      repairHint: `Replace hardcoded derived values with expressions using primary parameters. For example, "total_width = 315" should be "total_width = capsule_count * capsule_h + (capsule_count - 1) * gap".`,
      autoFixable: true,
    })
  }

  return results
}

// ─── #4: Z-Stack Validator ───────────────────────────────────────────

/**
 * Checks that the maximum Z coordinate in the code is consistent with
 * the space budget total from the interface definition.
 *
 * @param pythonCode - Generated CadQuery Python code
 * @param interfaceDefinition - Interface definition from Step 2
 * @returns Validation results (warnings for height mismatches)
 */
export function validateZStack(
  pythonCode: string,
  interfaceDefinition: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // INTENT: Extract max Z from code by finding .workplane(offset=Z) and
  // .transformed(offset=(X,Y,Z)) calls with numeric literals.
  const zValues: number[] = []

  // Pattern 1: .workplane(offset=N)
  // INTENT: Track raw signed values — negative offsets are legitimate (e.g. recessed geometry).
  // The span (maxZ - minZ) is what matters, not the absolute maximum.
  const wpPattern = /\.workplane\s*\(\s*offset\s*=\s*(-?\d+(?:\.\d+)?)/g
  let match: RegExpExecArray | null
  while ((match = wpPattern.exec(pythonCode)) !== null) {
    zValues.push(parseFloat(match[1]))
  }

  // Pattern 2: .transformed(offset=(X, Y, Z)) — extract the Z component
  const tfPattern = /\.transformed\s*\(\s*offset\s*=\s*\(\s*(?:-?\d+(?:\.\d+)?)\s*,\s*(?:-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g
  while ((match = tfPattern.exec(pythonCode)) !== null) {
    zValues.push(parseFloat(match[1]))
  }

  if (zValues.length === 0) return results

  // INTENT: Include 0 as implicit baseline (geometry always starts at z=0).
  // Compute span = maxZ - minZ to handle negative offsets correctly.
  const maxZ = Math.max(0, ...zValues)
  const minZ = Math.min(0, ...zValues)
  const zSpan = maxZ - minZ

  // INTENT: Extract total height from space budget
  const budgetMatch = interfaceDefinition.match(
    /===\s*a\)\s*SPACE\s*BUDGET\s*===\s*([\s\S]*?)(?:===\s*b\)|$)/i,
  )
  if (!budgetMatch) return results

  // Look for "Total: Nmm" in the space budget
  const totalMatch = budgetMatch[1].match(
    /(?:Total|Sum)[^:]*:\s*(\d+(?:\.\d+)?)\s*mm/i,
  )
  if (!totalMatch) return results

  const expectedHeight = parseFloat(totalMatch[1])
  if (expectedHeight === 0) return results

  const ratio = zSpan / expectedHeight
  // INTENT: Scale tolerance by object size — small objects (≤100mm) get ±20%,
  // large objects (≥1000mm) get ±10%, linear interpolation between.
  const tolerance = expectedHeight <= 100 ? 0.2
    : expectedHeight >= 1000 ? 0.1
    : 0.2 - (0.1 * (expectedHeight - 100) / 900)
  if (ratio > 1 + tolerance || ratio < 1 - tolerance) {
    results.push({
      ruleId: "zstack-height-mismatch",
      severity: "warning",
      message: `Z span in code (${zSpan.toFixed(0)}mm) differs from space budget total (${expectedHeight.toFixed(0)}mm) by ${((Math.abs(ratio - 1)) * 100).toFixed(0)}%`,
      repairHint: `The Z-span in the code doesn't match the space budget. The space budget total is ${expectedHeight}mm but the Z span in code is ${zSpan.toFixed(0)}mm. Check for doubled heights or missing offsets.`,
    })
  }

  return results
}

// ─── #5: CadQuery Static Analyzer ────────────────────────────────────

/**
 * Static analysis of CadQuery code for known problematic patterns.
 *
 * Checks:
 * 1. .shell() — fragile, prefer outer.cut(inner)
 * 2. .sweep() — prefer .extrude() + positioning
 * 3. .loft() with 3+ sections — complex, often fails
 * 4. .fillet() after .union() — fillet before union is more reliable
 * 5. Missing result = assignment — critical, Modal will fail
 * 6. .union() chain >15 — should use cq.Assembly()
 *
 * @param pythonCode - Generated CadQuery Python code
 * @returns Validation results
 */
export function analyzeCadQueryCode(
  pythonCode: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // Check 1: .shell() usage
  const shellCount = countOccurrences(pythonCode, /\.shell\s*\(/g)
  if (shellCount > 0) {
    results.push({
      ruleId: "cq-shell-fragile",
      severity: "warning",
      message: `.shell() used ${shellCount}x — fragile operation that often fails on complex geometry`,
      repairHint: `Replace .shell() with outer.cut(inner) pattern: create a slightly smaller inner solid and subtract it from the outer solid. This is more reliable than .shell().`,
      autoFixable: true,
    })
  }

  // Check 2: .sweep() usage
  const sweepCount = countOccurrences(pythonCode, /\.sweep\s*\(/g)
  if (sweepCount > 0) {
    results.push({
      ruleId: "cq-sweep-fragile",
      severity: "warning",
      message: `.sweep() used ${sweepCount}x — often fails with self-intersecting paths`,
      repairHint: `Replace .sweep() with .extrude() + .transformed() positioning. Build the shape from extruded sections placed along the path instead of sweeping a profile.`,
      autoFixable: true,
    })
  }

  // Check 3: .loft() with 3+ workplane sections
  const loftCount = countOccurrences(pythonCode, /\.loft\s*\(/g)
  if (loftCount > 0) {
    // Count workplane sections near loft calls
    const loftSections = pythonCode.match(
      /\.workplane[\s\S]{0,2000}?\.loft\s*\(/g,
    )
    const multiSectionLoft = loftSections?.some((section) => {
      const wpCount = (section.match(/\.workplane/g) || []).length
      return wpCount >= 3
    })
    if (multiSectionLoft) {
      results.push({
        ruleId: "cq-loft-complex",
        severity: "warning",
        message: `.loft() with 3+ workplane sections — complex lofts frequently fail in CadQuery`,
        repairHint: `Simplify the loft to 2 sections, or break it into multiple 2-section lofts joined with .union(). Consider using .extrude() with tapered profiles instead.`,
      })
    }
  }

  // Check 4: .fillet() after .union()
  const filletAfterUnion = /\.union\s*\([^)]*\)[\s\S]{0,200}?\.fillet\s*\(/g
  if (filletAfterUnion.test(pythonCode)) {
    results.push({
      ruleId: "cq-fillet-after-union",
      severity: "warning",
      message: `.fillet() called after .union() — filleting compound solids is unreliable`,
      repairHint: `Apply .fillet() to individual components before .union(). Fillet the edges on each part separately, then union the filleted parts together.`,
    })
  }

  // Check 5: Missing result = assignment (CRITICAL)
  const hasResult = /^result\s*=/m.test(pythonCode)
  if (!hasResult) {
    results.push({
      ruleId: "cq-missing-result",
      severity: "critical",
      message: `No "result = " assignment found — Modal execution will fail`,
      repairHint: `Add a "result = " assignment as the final line of the script. It must be assigned to a cq.Workplane or cq.Compound object.`,
    })
  }

  // Check 5b: result = None as final assignment (CRITICAL)
  // INTENT: Some LLM outputs initialise `result = None` then assign real geometry,
  // but sometimes the final assignment is still `result = None`. Catch that.
  if (hasResult) {
    const resultAssignments = [...pythonCode.matchAll(/^result\s*=\s*(.+)/gm)]
    if (resultAssignments.length > 0) {
      const lastRhs = resultAssignments[resultAssignments.length - 1][1].trim()
      if (/^None\s*(?:#.*)?$/.test(lastRhs)) {
        results.push({
          ruleId: "cq-result-none",
          severity: "critical",
          message: `Final "result" assignment is None — Modal execution will produce no geometry`,
          repairHint: `The last "result = " line assigns None instead of a cq.Workplane or cq.Compound object. Ensure result is assigned to the final assembled geometry.`,
        })
      }
    }
  }

  // Check 6: .union() chain >15
  const unionCount = countOccurrences(pythonCode, /\.union\s*\(/g)
  if (unionCount > 15) {
    results.push({
      ruleId: "cq-union-chain-long",
      severity: "warning",
      message: `.union() called ${unionCount}x — long union chains are O(n²) and may timeout`,
      repairHint: `Use cq.Assembly() for models with many components. Add sub-groups to the assembly with .add() and cq.Location. Convert to solid with assy.toCompound().`,
      autoFixable: true,
    })
  }

  return results
}

// ─── A2: Function Invocation Checker ────────────────────────────────

/**
 * Checks that every `def make_*()` function is actually called at least once.
 * Uncalled functions indicate dead code — the LLM defined a component but
 * forgot to include it in the assembly.
 *
 * @param pythonCode - Generated CadQuery Python code
 * @returns Validation results (warnings for uncalled make_* functions)
 */
export function checkFunctionInvocations(
  pythonCode: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  // Extract all `def make_*()` function names
  const defPattern = /def\s+(make_\w+)\s*\(/g
  const funcNames: string[] = []
  let defMatch: RegExpExecArray | null
  while ((defMatch = defPattern.exec(pythonCode)) !== null) {
    funcNames.push(defMatch[1])
  }

  if (funcNames.length === 0) return results

  // For each function, count total occurrences of `make_name(` in the code.
  // One occurrence is the def itself; need ≥2 (1 def + ≥1 call).
  const uncalled: string[] = []
  for (const funcName of funcNames) {
    const callPattern = new RegExp(`${funcName}\\s*\\(`, "g")
    const occurrences = (pythonCode.match(callPattern) || []).length
    if (occurrences < 2) {
      uncalled.push(funcName)
    }
  }

  if (uncalled.length > 0) {
    results.push({
      ruleId: "cq-uncalled-make-fn",
      severity: "warning",
      message: `${uncalled.length} make_*() function(s) defined but never called: ${uncalled.join(", ")}`,
      repairHint: `These functions are defined but never invoked in the assembly. Add calls to include them in the result: ${uncalled.join(", ")}. Each make_*() function should be called and .union()'d or added to the assembly.`,
      autoFixable: true,
    })
  }

  return results
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Counts regex occurrences in text */
function countOccurrences(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length
}

/** Returns true if a variable name looks like a primary parameter (not derived) */
function isPrimaryParam(name: string): boolean {
  const primaryPatterns = [
    /^num_/,
    /^count$/,
    /_count$/,
    /_qty$/,
    /^material_/,
    /^density$/,
    /^pi$/,
    /^tolerance$/,
    /^clearance$/,
    /^wall_t$/,
    /_diameter$/,
    /_radius$/,
    /^diameter$/,
    /^radius$/,
    /_spacing$/,
    /^spacing$/,
    /_pitch$/,
    /^pitch$/,
    /^gap$/,
    /_gap$/,
    /_thickness$/,
    /^thickness$/,
    /_angle$/,
    /^angle$/,
    /_offset$/,
  ]
  return primaryPatterns.some((p) => p.test(name))
}
