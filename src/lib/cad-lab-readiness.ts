import type { CadLabModule } from "@/lib/cad-lab-types"

export const REQUIRED_DIAGNOSTIC_KEYS = [
  "mfg_process",
  "material",
  "tolerance",
  "finish",
  "batch_size",
  "environment",
] as const

export type CadLabDiagnosticRecord = Record<string, string>

export interface ModuleArtifactReadiness {
  hasStep: boolean
  hasStl: boolean
  hasManifest: boolean
  missingArtifacts: string[]
  scorePct: number
}

export function getModuleArtifactReadiness(
  module: CadLabModule,
): ModuleArtifactReadiness {
  const files = module.result?.drawingPackage?.files ?? []
  const hasStep = files.some((file) => file.name.toLowerCase().endsWith(".step"))
  const hasStl = files.some((file) => file.name.toLowerCase().endsWith(".stl"))
  const hasManifest = Boolean(module.result?.drawingPackage?.manifestUrl)
  const missingArtifacts: string[] = []
  if (!hasStep) missingArtifacts.push("STEP")
  if (!hasStl) missingArtifacts.push("STL")
  if (!hasManifest) missingArtifacts.push("Manifest")

  return {
    hasStep,
    hasStl,
    hasManifest,
    missingArtifacts,
    scorePct: Math.round(((3 - missingArtifacts.length) / 3) * 100),
  }
}

export function isDiagnosticsComplete(
  diagnostics: CadLabDiagnosticRecord,
): boolean {
  return REQUIRED_DIAGNOSTIC_KEYS.every((key) => {
    const value = diagnostics[key]
    return typeof value === "string" && value.trim().length > 0
  })
}
