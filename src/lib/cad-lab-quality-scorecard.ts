import type { CadLabModule } from "@/lib/cad-lab-types"
import {
  getModuleArtifactReadiness,
  isDiagnosticsComplete,
} from "@/lib/cad-lab-readiness"
import { validateModule } from "@/lib/cad-lab/validation-rules"

export interface CadLabQualityScorecard {
  cadValidityScore: number
  drawingCompletenessScore: number
  rfqReadinessScore: number
  overallScore: number
  blockers: string[]
  /** Number of modules that passed validation with no critical issues */
  validationPassCount?: number
  /** Number of modules with critical validation failures */
  validationFailCount?: number
  /** P4: Percentage of modules that succeeded on first attempt (no repairs) */
  firstAttemptSuccessPct?: number
}

export type CadLabDiagnosticsByModule = Record<string, Record<string, string>>

export function computeCadLabQualityScorecard(
  modules: CadLabModule[],
  diagnosticsByModule: CadLabDiagnosticsByModule = {},
): CadLabQualityScorecard {
  const moduleCount = modules.length || 1
  const generated = modules.filter((mod) => mod.status === "generated")
  const generatedCount = generated.length
  const geometryCount = generated.filter((mod) => Boolean(mod.result?.bbox)).length
  const dfmCount = generated.filter((mod) => Boolean(mod.result?.dfm)).length
  const quoteReadyCount = generated.filter((mod) => {
    const readiness = getModuleArtifactReadiness(mod)
    return readiness.hasStep && readiness.hasStl && readiness.hasManifest
  }).length
  const diagnosticsCompleteCount = modules.filter((mod) =>
    isDiagnosticsComplete(diagnosticsByModule[mod.id] || {}),
  ).length
  const manifestCoverageCount = generated.filter(
    (mod) => getModuleArtifactReadiness(mod).hasManifest,
  ).length

  // INTENT: Run automated validation on generated modules
  let validationPassCount = 0
  let validationFailCount = 0
  for (const mod of generated) {
    const summary = validateModule(mod, diagnosticsByModule[mod.id] ?? {})
    if (summary.criticalCount === 0) {
      validationPassCount++
    } else {
      validationFailCount++
    }
  }

  // P4: Compute first-attempt success percentage
  const firstAttemptSuccessCount = generated.filter(
    (mod) => mod.result?.firstAttemptSuccess === true,
  ).length
  const firstAttemptSuccessPct = generatedCount > 0
    ? Math.round((firstAttemptSuccessCount / generatedCount) * 100)
    : undefined

  // INTENT: Validation pass rate factors into CAD validity — failing validation
  // means the geometry/config is not ready for manufacturing
  const validationFactor = generatedCount > 0
    ? validationPassCount / generatedCount
    : 1

  const cadValidityScore = Math.round(
    (generatedCount / moduleCount) * 40 +
      (geometryCount / moduleCount) * 20 +
      (dfmCount / moduleCount) * 20 +
      validationFactor * 20,
  )

  const drawingCompletenessScore = Math.round(
    (quoteReadyCount / moduleCount) * 70 +
      (manifestCoverageCount / moduleCount) * 30,
  )

  const rfqReadinessScore = Math.round(
    (generatedCount / moduleCount) * 45 +
      (diagnosticsCompleteCount / moduleCount) * 35 +
      (quoteReadyCount / moduleCount) * 20,
  )

  const overallScore = Math.round(
    (cadValidityScore + drawingCompletenessScore + rfqReadinessScore) / 3,
  )

  const blockers: string[] = []
  if (generatedCount < modules.length) {
    blockers.push(`${modules.length - generatedCount} module(s) not generated`)
  }
  if (dfmCount < generatedCount) {
    blockers.push(`${generatedCount - dfmCount} generated module(s) missing DFM analysis`)
  }
  if (diagnosticsCompleteCount < modules.length) {
    blockers.push(`${modules.length - diagnosticsCompleteCount} module(s) missing procurement diagnostics`)
  }
  if (quoteReadyCount < generatedCount) {
    blockers.push(`${generatedCount - quoteReadyCount} generated module(s) missing STEP/STL/manifest`)
  }
  if (validationFailCount > 0) {
    blockers.push(`${validationFailCount} module(s) failed design validation with critical issues`)
  }

  return {
    cadValidityScore,
    drawingCompletenessScore,
    rfqReadinessScore,
    overallScore,
    blockers,
    validationPassCount,
    validationFailCount,
    firstAttemptSuccessPct,
  }
}
