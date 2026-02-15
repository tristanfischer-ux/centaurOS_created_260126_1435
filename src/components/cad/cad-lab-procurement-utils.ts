import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

export interface RfqReadinessSummary {
  totalScore: number
  generatedCount: number
  diagnosticsComplete: number
  artifactComplete: number
  gaps: string[]
}

export function computeRfqReadiness(
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers,
): RfqReadinessSummary {
  const moduleCount = modules.length || 1
  const generatedCount = modules.filter((mod) => mod.status === "generated").length
  const diagnosticsComplete = modules.filter((mod) => {
    const answers = diagnosticAnswers?.[mod.id] || {}
    return Object.keys(answers).length >= 6
  }).length
  const artifactComplete = modules.filter((mod) => {
    const files = mod.result?.drawingPackage?.files || []
    const hasStep = files.some((file) => file.name.toLowerCase().endsWith(".step"))
    const hasStl = files.some((file) => file.name.toLowerCase().endsWith(".stl"))
    const hasManifest = Boolean(mod.result?.drawingPackage?.manifestUrl)
    return hasStep && hasStl && hasManifest
  }).length

  const generationScore = generatedCount / moduleCount
  const diagnosticsScore = diagnosticsComplete / moduleCount
  const artifactsScore = artifactComplete / moduleCount
  const totalScore = Math.round(
    generationScore * 45 +
    diagnosticsScore * 35 +
    artifactsScore * 20,
  )

  const gaps: string[] = []
  if (generatedCount < modules.length) {
    gaps.push(`${modules.length - generatedCount} module(s) still need generated geometry`)
  }
  if (diagnosticsComplete < modules.length) {
    gaps.push(`${modules.length - diagnosticsComplete} module(s) missing procurement diagnostics`)
  }
  if (artifactComplete < modules.length) {
    gaps.push(`${modules.length - artifactComplete} module(s) missing full STEP/STL/manifest package`)
  }

  return {
    totalScore,
    generatedCount,
    diagnosticsComplete,
    artifactComplete,
    gaps,
  }
}
