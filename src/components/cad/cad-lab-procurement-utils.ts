import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

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

const REQUIRED_DIAGNOSTIC_KEYS = [
  "mfg_process",
  "material",
  "tolerance",
  "finish",
  "batch_size",
  "environment",
] as const

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

    const files = mod.result?.drawingPackage?.files || []
    const hasStep = files.some((file) => file.name.toLowerCase().endsWith(".step"))
    const hasStl = files.some((file) => file.name.toLowerCase().endsWith(".stl"))
    const hasManifest = Boolean(mod.result?.drawingPackage?.manifestUrl)
    const missingArtifacts: string[] = []
    if (!hasStep) missingArtifacts.push("STEP")
    if (!hasStl) missingArtifacts.push("STL")
    if (!hasManifest) missingArtifacts.push("Manifest")

    return {
      moduleId: mod.id,
      moduleName: mod.name,
      generated,
      missingDiagnostics,
      missingArtifacts,
      quoteReady: generated && missingArtifacts.length === 0,
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
    quoteReadyModuleCount,
    gaps,
    moduleDetails,
  }
}
