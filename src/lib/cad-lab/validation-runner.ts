/**
 * @file validation-runner.ts — Orchestrates validation across CAD Lab modules.
 *
 * @description Runs all validation rules against one or more modules, producing
 * a per-module summary and a project-level validation report. Designed to be
 * called client-side after module generation completes.
 *
 * @related
 * - Rule engine: src/lib/cad-lab/validation-rules.ts
 * - Quality scorecard: src/lib/cad-lab-quality-scorecard.ts
 * - Types: src/lib/cad-lab-types.ts
 */

import type { CadLabModule } from "@/lib/cad-lab-types"
import { validateModule } from "./validation-rules"
import type { ValidationSummary } from "./validation-rules"

// ─── Types ──────────────────────────────────────────────────────────

/** Diagnostic answers keyed by moduleId → questionId → answer */
type DiagnosticsByModule = Record<string, Record<string, string>>

/** Project-level validation report aggregating all module summaries */
export interface ProjectValidationReport {
  /** Overall project verdict (worst of all modules) */
  verdict: "pass" | "warn" | "fail"
  /** Per-module validation summaries */
  moduleSummaries: ValidationSummary[]
  /** Total critical issues across all modules */
  totalCritical: number
  /** Total warnings across all modules */
  totalWarnings: number
  /** Total info notes across all modules */
  totalInfo: number
  /** Number of modules that passed validation */
  passedCount: number
  /** Number of modules that had warnings only */
  warnedCount: number
  /** Number of modules that failed validation */
  failedCount: number
  /** Number of modules that were skipped (not generated) */
  skippedCount: number
  /** When the report was generated */
  generatedAt: string
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Validate a single module with its diagnostic answers.
 *
 * @description Convenience wrapper around validateModule from the rule engine.
 * Handles the case where a module hasn't been generated yet (returns a
 * "skipped" summary).
 *
 * @param module - The CAD Lab module to validate
 * @param diagnostics - Diagnostic answers for this module
 * @returns Validation summary for the module
 */
export function runModuleValidation(
  module: CadLabModule,
  diagnostics: Record<string, string> = {},
): ValidationSummary {
  // INTENT: Only validate modules that have generation results
  if (module.status !== "generated" && !module.result) {
    return {
      verdict: "pass",
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      results: [],
      moduleId: module.id,
      validatedAt: new Date().toISOString(),
    }
  }

  return validateModule(module, diagnostics)
}

/**
 * Validate all modules in a project, producing a project-level report.
 *
 * @description Runs validation on each generated module and aggregates results
 * into a project-level report with overall verdict and counts.
 *
 * @param modules - All modules in the project
 * @param diagnosticsByModule - Diagnostic answers keyed by moduleId
 * @returns Project-level validation report
 */
export function runProjectValidation(
  modules: CadLabModule[],
  diagnosticsByModule: DiagnosticsByModule = {},
): ProjectValidationReport {
  const moduleSummaries: ValidationSummary[] = []
  let skippedCount = 0

  for (const mod of modules) {
    if (mod.status !== "generated" && !mod.result) {
      skippedCount++
      continue
    }

    const summary = validateModule(mod, diagnosticsByModule[mod.id] ?? {})
    moduleSummaries.push(summary)
  }

  const totalCritical = moduleSummaries.reduce((sum, s) => sum + s.criticalCount, 0)
  const totalWarnings = moduleSummaries.reduce((sum, s) => sum + s.warningCount, 0)
  const totalInfo = moduleSummaries.reduce((sum, s) => sum + s.infoCount, 0)
  const passedCount = moduleSummaries.filter(s => s.verdict === "pass").length
  const warnedCount = moduleSummaries.filter(s => s.verdict === "warn").length
  const failedCount = moduleSummaries.filter(s => s.verdict === "fail").length

  let verdict: "pass" | "warn" | "fail"
  if (failedCount > 0) {
    verdict = "fail"
  } else if (warnedCount > 0) {
    verdict = "warn"
  } else {
    verdict = "pass"
  }

  return {
    verdict,
    moduleSummaries,
    totalCritical,
    totalWarnings,
    totalInfo,
    passedCount,
    warnedCount,
    failedCount,
    skippedCount,
    generatedAt: new Date().toISOString(),
  }
}
