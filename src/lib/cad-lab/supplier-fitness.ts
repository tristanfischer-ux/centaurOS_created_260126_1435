/**
 * @file supplier-fitness.ts — Instant client-side fitness checks for matched suppliers.
 *
 * @description Pure function that runs 6 rule-based checks against supplier matches
 * and diagnostic answers. No API call — shows results immediately after matching.
 *
 * @related
 * - Supplier matching: src/actions/cad-lab-supplier-match.ts
 * - Tolerance mapping: src/lib/cad-lab/diagnostic-to-technique.ts
 */

import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { getToleranceMm } from "@/lib/cad-lab/diagnostic-to-technique"

// ─── Types ──────────────────────────────────────────────────────────

export interface FitnessCheck {
  id: string
  severity: "critical" | "warning" | "info"
  moduleId?: string
  moduleName?: string
  message: string
}

export interface SupplierFitnessResult {
  checks: FitnessCheck[]
  hasCritical: boolean
  hasWarning: boolean
}

// ─── Main Function ──────────────────────────────────────────────────

/**
 * @description Runs instant client-side fitness checks on supplier matches.
 * @param modules - Eligible CAD Lab modules
 * @param diagnosticAnswers - Per-module diagnostic answers (process, material, tolerance, etc.)
 * @param supplierMatches - Map of moduleId → matched suppliers
 * @returns FitnessCheck[] grouped by severity
 */
export function computeSupplierFitness(
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
  supplierMatches: Map<string, CadLabSupplierMatch[]>,
): SupplierFitnessResult {
  const checks: FitnessCheck[] = []

  for (const mod of modules) {
    const matches = supplierMatches.get(mod.id) ?? []
    const diag = diagnosticAnswers[mod.id]

    // Check 1: No matches (critical)
    if (matches.length === 0) {
      checks.push({
        id: `no-match-${mod.id}`,
        severity: "critical",
        moduleId: mod.id,
        moduleName: mod.name,
        message: "No suppliers matched — manual sourcing required.",
      })
      continue
    }

    // Check 2: Single source risk (warning)
    if (matches.length === 1) {
      checks.push({
        id: `single-source-${mod.id}`,
        severity: "warning",
        moduleId: mod.id,
        moduleName: mod.name,
        message: `Only 1 supplier matched (${matches[0].name}). Single-source risk — consider broadening search criteria.`,
      })
    }

    if (!diag) continue

    // Check 3: Tolerance gap (warning)
    const requiredTolerance = getToleranceMm(diag.tolerance)
    if (requiredTolerance != null && requiredTolerance <= 0.05) {
      const hasCapableSupplier = matches.some((m) =>
        m.processCapabilities?.some(
          (cap) => cap.tolerance_value_mm != null && cap.tolerance_value_mm <= requiredTolerance,
        ),
      )
      if (!hasCapableSupplier) {
        checks.push({
          id: `tolerance-gap-${mod.id}`,
          severity: "warning",
          moduleId: mod.id,
          moduleName: mod.name,
          message: `Requires ${diag.tolerance} but no matched supplier has verified capability at that tolerance.`,
        })
      }
    }

    // Check 4: Material mismatch (warning)
    if (diag.material) {
      const materialLower = diag.material.toLowerCase()
      const hasMaterialMatch = matches.some((m) =>
        m.processCapabilities?.some(
          (cap) =>
            cap.materials_worked?.some((mat) =>
              mat.toLowerCase().includes(materialLower) || materialLower.includes(mat.toLowerCase().split(" ")[0]),
            ),
        ) ||
        m.matchReasons.some((r) => r.toLowerCase().includes("material")),
      )
      if (!hasMaterialMatch) {
        checks.push({
          id: `material-mismatch-${mod.id}`,
          severity: "warning",
          moduleId: mod.id,
          moduleName: mod.name,
          message: `Requires "${diag.material}" but no matched supplier lists this material in verified capabilities.`,
        })
      }
    }

    // Check 5: Process mismatch (warning)
    if (diag.mfg_process && diag.mfg_process !== "Other") {
      const processLower = diag.mfg_process.toLowerCase()
      const hasProcessMatch = matches.some((m) =>
        m.processCapabilities?.some(
          (cap) => cap.process_category?.toLowerCase().includes(processLower.split(" ")[0]),
        ) ||
        m.matchReasons.some((r) => r.toLowerCase().includes("process")),
      )
      if (!hasProcessMatch) {
        checks.push({
          id: `process-mismatch-${mod.id}`,
          severity: "warning",
          moduleId: mod.id,
          moduleName: mod.name,
          message: `Requires "${diag.mfg_process}" but no matched supplier has verified capability for this process.`,
        })
      }
    }

    // Check 6: Unverified supplier on critical spec (critical)
    const isCriticalSpec = requiredTolerance != null && requiredTolerance <= 0.05
    const isHarshEnv = diag.environment?.toLowerCase().includes("outdoor") || diag.environment?.toLowerCase().includes("harsh")
    if (isCriticalSpec || isHarshEnv) {
      const allUnverified = matches.every((m) => !m.isVerified)
      if (allUnverified) {
        checks.push({
          id: `unverified-critical-${mod.id}`,
          severity: "critical",
          moduleId: mod.id,
          moduleName: mod.name,
          message: `${isCriticalSpec ? "Tight tolerance" : "Harsh environment"} spec with no verified suppliers — request certifications before ordering.`,
        })
      }
    }
  }

  return {
    checks,
    hasCritical: checks.some((c) => c.severity === "critical"),
    hasWarning: checks.some((c) => c.severity === "warning"),
  }
}
