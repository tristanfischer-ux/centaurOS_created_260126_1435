import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import {
  getModuleArtifactReadiness,
  REQUIRED_DIAGNOSTIC_KEYS,
} from "@/lib/cad-lab-readiness"

export interface RfqReadinessSummary {
  totalScore: number
  generatedCount: number
  diagnosticsComplete: number
  artifactComplete: number
  quoteReadyModuleCount: number
  gaps: string[]
  moduleDetails: ModuleReadinessDetail[]
}

export interface ModuleReadinessDetail {
  moduleId: string
  moduleName: string
  generated: boolean
  missingDiagnostics: string[]
  missingArtifacts: string[]
  quoteReady: boolean
}

export function computeRfqReadiness(
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers,
): RfqReadinessSummary {
  const moduleCount = modules.length || 1
  const moduleDetails = modules.map((mod): ModuleReadinessDetail => {
    const generated = mod.status === "generated"
    const answers = diagnosticAnswers?.[mod.id] || {}
    const missingDiagnostics = REQUIRED_DIAGNOSTIC_KEYS.filter((key) => {
      const value = answers[key]
      return typeof value !== "string" || value.trim().length === 0
    })

    const artifactReadiness = getModuleArtifactReadiness(mod)
    const missingArtifacts = artifactReadiness.missingArtifacts

    return {
      moduleId: mod.id,
      moduleName: mod.name,
      generated,
      missingDiagnostics,
      missingArtifacts,
      // DECISION: diagnostics-complete = quote-ready. CAD artifacts (STEP/STL/manifest)
      // are optional — CAD generation is beta and not yet in active use.
      quoteReady: missingDiagnostics.length === 0,
    }
  })
  const generatedCount = moduleDetails.filter((mod) => mod.generated).length
  const diagnosticsComplete = moduleDetails.filter(
    (mod) => mod.missingDiagnostics.length === 0,
  ).length
  const artifactComplete = moduleDetails.filter(
    (mod) => mod.missingArtifacts.length === 0,
  ).length
  const quoteReadyModuleCount = moduleDetails.filter((mod) => mod.quoteReady).length

  const generationScore = generatedCount / moduleCount
  const diagnosticsScore = diagnosticsComplete / moduleCount
  // DECISION: Dropped artifacts from the score — CAD is beta, diagnostics + generation
  // are the primary readiness signals. 60/40 weighting matches server-side logic.
  const totalScore = Math.round(
    diagnosticsScore * 60 +
    generationScore * 40,
  )

  const gaps: string[] = []
  if (generatedCount < modules.length) {
    gaps.push(`${modules.length - generatedCount} module(s) still need generated geometry`)
  }
  if (diagnosticsComplete < modules.length) {
    gaps.push(`${modules.length - diagnosticsComplete} module(s) missing procurement diagnostics`)
  }
  // INTENT: Artifact gap message removed — CAD artifacts are informational only, not a blocker.

  return {
    totalScore,
    generatedCount,
    diagnosticsComplete,
    artifactComplete,
    quoteReadyModuleCount,
    gaps,
    moduleDetails,
  }
}
