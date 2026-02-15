"use server"

/**
 * @file cad-lab-rfq.ts — Create marketplace RFQs from Cad Lab projects.
 *
 * @description Bridges The Forge Cad Lab procurement stage to the RFQ marketplace.
 * Builds a structured RFQ payload from generated module outputs, diagnostics,
 * and drawing package artifacts so users can dispatch a quote request without
 * copy/paste.
 */

import { createNewRFQ } from "@/actions/rfq"
import type { CadLabDesignBrief, CadLabModule } from "@/lib/cad-lab-types"

interface CreateCadLabRfqInput {
  projectName: string
  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  deadline?: string
  designBrief?: CadLabDesignBrief
  assumptionNotes?: string
}

const REQUIRED_DIAGNOSTIC_KEYS = [
  "mfg_process",
  "material",
  "tolerance",
  "finish",
  "batch_size",
  "environment",
] as const

function parseQuantityToken(value: string): number | undefined {
  const normalized = value.trim().toLowerCase().replace(/,/g, "")
  const match = normalized.match(/^(\d+(?:\.\d+)?)([km]?)$/)
  if (!match) return undefined

  const num = Number(match[1])
  if (!Number.isFinite(num)) return undefined
  const suffix = match[2]
  if (suffix === "k") return Math.round(num * 1_000)
  if (suffix === "m") return Math.round(num * 1_000_000)
  return Math.round(num)
}

function parseBatchQuantity(batch: string | undefined): number | undefined {
  if (!batch) return undefined
  const range = batch.match(/(\d+(?:\.\d+)?(?:,\d{3})*\s*[kKmM]?)\s*[-–]\s*(\d+(?:\.\d+)?(?:,\d{3})*\s*[kKmM]?)/)
  if (range) {
    const min = parseQuantityToken(range[1])
    const max = parseQuantityToken(range[2])
    if (typeof min !== "number" || typeof max !== "number") return undefined
    return Math.round((min + max) / 2)
  }
  const single = batch.match(/(\d+(?:\.\d+)?(?:,\d{3})*\s*[kKmM]?)/)
  if (!single) return undefined
  return parseQuantityToken(single[1])
}

function computeModuleReadiness(
  module: CadLabModule,
  diagnosticAnswers: Record<string, Record<string, string>>,
): {
  diagnosticsComplete: boolean
  hasStep: boolean
  hasStl: boolean
  hasManifest: boolean
  scorePct: number
} {
  const diag = diagnosticAnswers[module.id] || {}
  const diagnosticsComplete = REQUIRED_DIAGNOSTIC_KEYS.every((key) => {
    const value = diag[key]
    return typeof value === "string" && value.trim().length > 0
  })

  const files = module.result?.drawingPackage?.files ?? []
  const hasStep = files.some((file) => file.name.toLowerCase().endsWith(".step"))
  const hasStl = files.some((file) => file.name.toLowerCase().endsWith(".stl"))
  const hasManifest = Boolean(module.result?.drawingPackage?.manifestUrl)

  const scorePct = Math.round(
    (diagnosticsComplete ? 40 : 0) +
      (hasStep ? 20 : 0) +
      (hasStl ? 20 : 0) +
      (hasManifest ? 20 : 0),
  )

  return {
    diagnosticsComplete,
    hasStep,
    hasStl,
    hasManifest,
    scorePct,
  }
}

/**
 * Creates a real RFQ marketplace record from Cad Lab module outputs.
 */
export async function createCadLabRfqAction(
  input: CreateCadLabRfqInput,
): Promise<{ rfqId: string } | { error: string }> {
  const generatedModules = input.modules.filter((m) => m.status === "generated")
  if (generatedModules.length === 0) {
    return { error: "At least one generated module is required before creating an RFQ." }
  }

  const moduleReadiness = generatedModules.map((module) => ({
    moduleId: module.id,
    moduleName: module.name,
    ...computeModuleReadiness(module, input.diagnosticAnswers),
  }))
  const overallReadinessScore = Math.round(
    moduleReadiness.reduce((sum, module) => sum + module.scorePct, 0) /
      moduleReadiness.length,
  )
  const quoteReadyModuleCount = moduleReadiness.filter(
    (module) => module.hasStep && module.hasStl && module.hasManifest,
  ).length
  if (quoteReadyModuleCount === 0) {
    return {
      error:
        "RFQ package is incomplete. At least one module must include STEP, STL, and drawing manifest artifacts.",
    }
  }

  const artifactUrlsRaw = generatedModules.flatMap((module) => {
    const files = module.result?.drawingPackage?.files ?? []
    const manifest = module.result?.drawingPackage?.manifestUrl
    const urls = files.map((f) => f.url)
    return manifest ? [...urls, manifest] : urls
  })
  const artifactUrls = Array.from(
    new Set(
      artifactUrlsRaw.filter((url) => /^https?:\/\//i.test(url)),
    ),
  )

  if (artifactUrls.length === 0) {
    return {
      error:
        "No CAD artifacts found. Generate STEP/STL outputs and drawing manifests before creating an RFQ.",
    }
  }

  const moduleSpecs = generatedModules.map((module) => {
    const diag = input.diagnosticAnswers[module.id] || {}
    return {
      id: module.id,
      name: module.name,
      purpose: module.purpose,
      keyParts: module.keyParts,
      envelopeMm: module.result?.bbox,
      massGrams: module.result?.massGrams,
      process: diag.mfg_process || null,
      material: diag.material || null,
      tolerance: diag.tolerance || null,
      finish: diag.finish || null,
      batchSize: diag.batch_size || null,
      environment: diag.environment || null,
      leadWeeks: module.leadWeeks,
      drawingPackage: module.result?.drawingPackage ?? null,
    }
  })

  const quantityHints = generatedModules
    .map((module) => parseBatchQuantity(input.diagnosticAnswers[module.id]?.batch_size))
    .filter((qty): qty is number => typeof qty === "number" && Number.isFinite(qty) && qty > 0)

  const estimatedQuantity = quantityHints.length > 0
    ? Math.max(...quantityHints)
    : undefined

  const materials = Array.from(
    new Set(
      generatedModules
        .map((m) => input.diagnosticAnswers[m.id]?.material)
        .filter((m): m is string => Boolean(m && m.trim())),
    ),
  )

  const descriptionLines = [
    `Forge-generated RFQ package for project "${input.projectName}".`,
    `${generatedModules.length} generated module(s) included with drawing manifests and CAD artifacts.`,
    `Overall package readiness score: ${overallReadinessScore}%`,
    `Quote-ready modules: ${quoteReadyModuleCount}/${generatedModules.length}`,
    "",
    "Module summary:",
    ...moduleSpecs.map((module, idx) =>
      `${idx + 1}. ${module.name} — ${module.purpose} | Lead ${module.leadWeeks}w | Envelope ${module.envelopeMm ? `${module.envelopeMm.xLen}×${module.envelopeMm.yLen}×${module.envelopeMm.zLen} mm` : "TBD"}`,
    ),
    "",
    "Readiness checks:",
    ...moduleReadiness.map((module, idx) => {
      const checks = [
        module.diagnosticsComplete ? "diagnostics✓" : "diagnostics✗",
        module.hasStep ? "step✓" : "step✗",
        module.hasStl ? "stl✓" : "stl✗",
        module.hasManifest ? "manifest✓" : "manifest✗",
      ].join(", ")
      return `${idx + 1}. ${module.moduleName} — ${module.scorePct}% (${checks})`
    }),
    "",
    "Design intent:",
    `- Use case: ${input.designBrief?.useCase?.trim() || "Not specified"}`,
    `- Target process: ${input.designBrief?.targetProcess?.trim() || "Not specified"}`,
    `- Target material: ${input.designBrief?.targetMaterial?.trim() || "Not specified"}`,
    `- Tolerance target: ${input.designBrief?.toleranceTarget?.trim() || "Not specified"}`,
    `- Quantity target: ${input.designBrief?.quantityTarget?.trim() || "Not specified"}`,
    `- Compliance notes: ${input.designBrief?.complianceNotes?.trim() || "Not specified"}`,
    input.assumptionNotes?.trim()
      ? `- Assumptions: ${input.assumptionNotes.trim()}`
      : "- Assumptions: None recorded",
    "",
    "Suppliers should review attached drawing manifests and CAD artifacts before quoting.",
  ]

  const rfqResult = await createNewRFQ({
    title: `${input.projectName} — Manufacturing RFQ`,
    rfq_type: "custom",
    category: "Custom Manufacturing",
    deadline: input.deadline || null,
    specifications: {
      description: descriptionLines.join("\n"),
      quantity: estimatedQuantity,
      unit: estimatedQuantity ? "units" : undefined,
      materials: materials.length > 0 ? materials : undefined,
      attachments: artifactUrls.length > 0 ? artifactUrls : undefined,
      custom_fields: {
        source: "the-forge-cad-lab",
        project_name: input.projectName,
        module_count: generatedModules.length,
        package_readiness_score_pct: overallReadinessScore,
        quote_ready_module_count: quoteReadyModuleCount,
        design_brief: input.designBrief || null,
        assumption_notes: input.assumptionNotes?.trim() || null,
        readiness_checks: moduleReadiness,
        modules: moduleSpecs,
      },
    },
  })

  if (rfqResult.error || !rfqResult.data?.id) {
    return { error: rfqResult.error || "Failed to create RFQ from Cad Lab package." }
  }

  return { rfqId: rfqResult.data.id }
}
