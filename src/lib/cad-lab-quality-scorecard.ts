import type { CadLabModule } from "@/lib/cad-lab-types"
import {
  getModuleArtifactReadiness,
  isDiagnosticsComplete,
} from "@/lib/cad-lab-readiness"

export interface CadLabQualityScorecard {
  cadValidityScore: number
  drawingCompletenessScore: number
  rfqReadinessScore: number
  overallScore: number
  blockers: string[]
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

  const cadValidityScore = Math.round(
    (generatedCount / moduleCount) * 50 +
      (geometryCount / moduleCount) * 25 +
      (dfmCount / moduleCount) * 25,
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

  return {
    cadValidityScore,
    drawingCompletenessScore,
    rfqReadinessScore,
    overallScore,
    blockers,
  }
}
