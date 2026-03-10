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
import {
  getModuleArtifactReadiness,
  isDiagnosticsComplete,
} from "@/lib/cad-lab-readiness"
import { computeCadLabQualityScorecard } from "@/lib/cad-lab-quality-scorecard"

interface CreateCadLabRfqInput {
  projectName: string
  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  deadline?: string
  designBrief?: CadLabDesignBrief
  assumptionNotes?: string
}

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
  const candidates: number[] = []
  const rangePattern =
    /(\d+(?:\.\d+)?(?:,\d{3})*\s*[kKmM]?)\s*[-–]\s*(\d+(?:\.\d+)?(?:,\d{3})*\s*[kKmM]?)/g

  const rangeMatches = batch.matchAll(rangePattern)
  for (const match of rangeMatches) {
    const min = parseQuantityToken(match[1] || "")
    const max = parseQuantityToken(match[2] || "")
    if (typeof min === "number" && typeof max === "number") {
      candidates.push(Math.round((min + max) / 2))
    }
  }

  const withoutRanges = batch.replace(rangePattern, " ")
  const singleMatches = withoutRanges.matchAll(/(\d+(?:\.\d+)?(?:,\d{3})*\s*[kKmM]?)/g)
  for (const match of singleMatches) {
    const parsed = parseQuantityToken(match[1] || "")
    if (typeof parsed === "number") candidates.push(parsed)
  }

  if (candidates.length === 0) return undefined
  return Math.max(...candidates)
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
  const diagnosticsComplete = isDiagnosticsComplete(diag)
  const artifactReadiness = getModuleArtifactReadiness(module)
  const { hasStep, hasStl, hasManifest } = artifactReadiness

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
): Promise<{ rfqId: string; broadcastCount: number } | { error: string }> {
  // DECISION: Accept both "specified" and "generated" modules for RFQ creation.
  // CAD artifacts (STEP/STL) are optional score bonuses, not requirements.
  // Specified modules use diagnostics + descriptions + illustrations as RFQ payload.
  const eligibleModules = input.modules.filter((m) => m.status === "specified" || m.status === "generated")
  if (eligibleModules.length === 0) {
    return { error: "At least one specified or generated module is required before creating an RFQ." }
  }

  const moduleReadiness = eligibleModules.map((module) => ({
    moduleId: module.id,
    moduleName: module.name,
    ...computeModuleReadiness(module, input.diagnosticAnswers),
  }))
  const overallReadinessScore = Math.round(
    moduleReadiness.reduce((sum, module) => sum + module.scorePct, 0) /
      moduleReadiness.length,
  )
  const qualityScorecard = computeCadLabQualityScorecard(
    input.modules,
    input.diagnosticAnswers,
  )
  // DECISION: CAD artifacts are optional bonuses, not requirements.
  // A module with complete diagnostics is quote-ready even without STEP/STL.
  const quoteReadyModuleCount = moduleReadiness.filter(
    (module) => module.diagnosticsComplete || (module.hasStep && module.hasStl && module.hasManifest),
  ).length
  if (quoteReadyModuleCount === 0) {
    return {
      error: "RFQ package is incomplete — fill in module diagnostics or generate CAD with drawing packages before creating an RFQ.",
    }
  }

  const artifactUrlsRaw = eligibleModules.flatMap((module) => {
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

  // INTENT: Artifact URLs are now optional — spec-based RFQs are valid without CAD files.

  const moduleSpecs = eligibleModules.map((module) => {
    const diag = input.diagnosticAnswers[module.id] || {}
    const readiness = moduleReadiness.find((m) => m.moduleId === module.id)
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
      readiness: readiness
        ? {
            scorePct: readiness.scorePct,
            diagnosticsComplete: readiness.diagnosticsComplete,
            hasStep: readiness.hasStep,
            hasStl: readiness.hasStl,
            hasManifest: readiness.hasManifest,
          }
        : null,
      drawingPackage: module.result?.drawingPackage ?? null,
    }
  })
  const moduleBlockers = moduleReadiness
    .filter(
      (module) =>
        !module.diagnosticsComplete ||
        !module.hasStep ||
        !module.hasStl ||
        !module.hasManifest,
    )
    .map((module) => ({
      moduleId: module.moduleId,
      moduleName: module.moduleName,
      blockers: [
        ...(!module.diagnosticsComplete ? ["Diagnostics incomplete"] : []),
        ...(!module.hasStep ? ["Missing STEP"] : []),
        ...(!module.hasStl ? ["Missing STL"] : []),
        ...(!module.hasManifest ? ["Missing manifest"] : []),
      ],
    }))

  const quantityHints = eligibleModules
    .map((module) => parseBatchQuantity(input.diagnosticAnswers[module.id]?.batch_size))
    .filter((qty): qty is number => typeof qty === "number" && Number.isFinite(qty) && qty > 0)

  const estimatedQuantity = quantityHints.length > 0
    ? Math.max(...quantityHints)
    : undefined

  const materials = Array.from(
    new Set(
      eligibleModules
        .map((m) => input.diagnosticAnswers[m.id]?.material)
        .filter((m): m is string => Boolean(m && m.trim())),
    ),
  )

  const descriptionLines = [
    `Forge-generated RFQ package for project "${input.projectName}".`,
    `${eligibleModules.length} generated module(s) included with drawing manifests and CAD artifacts.`,
    `Overall package readiness score: ${overallReadinessScore}%`,
    `Quote-ready modules: ${quoteReadyModuleCount}/${eligibleModules.length}`,
    `Quality scorecard — CAD ${qualityScorecard.cadValidityScore}%, Drawings ${qualityScorecard.drawingCompletenessScore}%, RFQ ${qualityScorecard.rfqReadinessScore}%, Overall ${qualityScorecard.overallScore}%`,
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
    ...(moduleBlockers.length > 0
      ? [
          "",
          "Outstanding blockers:",
          ...moduleBlockers.map(
            (module, idx) =>
              `${idx + 1}. ${module.moduleName}: ${module.blockers.join("; ")}`,
          ),
        ]
      : []),
    ...(qualityScorecard.blockers.length > 0
      ? [
          "",
          "Scorecard blockers:",
          ...qualityScorecard.blockers.map(
            (blocker, idx) => `${idx + 1}. ${blocker}`,
          ),
        ]
      : []),
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
        module_count: eligibleModules.length,
        package_readiness_score_pct: overallReadinessScore,
        quote_ready_module_count: quoteReadyModuleCount,
        design_brief: input.designBrief || null,
        assumption_notes: input.assumptionNotes?.trim() || null,
        readiness_checks: moduleReadiness,
        module_blockers: moduleBlockers,
        quality_scorecard: qualityScorecard,
        modules: moduleSpecs,
      },
    },
  })

  if (rfqResult.error || !rfqResult.data?.id) {
    return { error: rfqResult.error || "Failed to create RFQ from Cad Lab package." }
  }

  return { rfqId: rfqResult.data.id, broadcastCount: rfqResult.data.broadcastCount }
}

// ─── Mashup Lab RFQ ────────────────────────────────────────────────────

interface CreateMashupRfqInput {
  /** User's mashup concept/description */
  concept: string
  /** Source STEP/STL files used as inputs */
  sources: { name: string; description?: string }[]
  /** Public URL to the generated STEP file (required) */
  stepUrl: string
  /** Public URL to the generated STL file (optional) */
  stlUrl: string | null
  /** Mashup strategy from the generation plan (embed, attach, morph, etc.) */
  strategy?: string
}

/**
 * Creates a marketplace RFQ from a Mashup Lab result.
 *
 * @description Builds a custom-manufacturing RFQ from the STEP/STL artifacts
 * generated by the Mashup Lab. The user's concept description becomes the RFQ
 * brief and the source files are listed as context for the manufacturer.
 *
 * @param input - Mashup result data including artifact URLs and source details
 * @returns RFQ ID on success, or an error message
 *
 * @security Requires authenticated user (enforced by createNewRFQ)
 * @audit Logs RFQ creation via createNewRFQ
 */
export async function createMashupRfqAction(
  input: CreateMashupRfqInput,
): Promise<{ rfqId: string } | { error: string }> {
  const { concept, sources, stepUrl, stlUrl, strategy } = input

  if (!stepUrl?.trim()) {
    return { error: "A STEP file is required to create an RFQ." }
  }

  if (!concept?.trim()) {
    return { error: "A concept description is required." }
  }

  const attachments: string[] = [stepUrl]
  if (stlUrl?.trim()) attachments.push(stlUrl)

  const sourceLines =
    sources.length > 0
      ? sources.map((s) =>
          s.description
            ? `- ${s.name}: ${s.description}`
            : `- ${s.name}`,
        )
      : ["- (no sources listed)"]

  const descriptionLines = [
    "Mashup Design",
    "─────────────",
    concept.trim(),
    "",
    "Source files combined:",
    ...sourceLines,
    ...(strategy
      ? ["", `Combination strategy: ${strategy}`]
      : []),
    "",
    "STEP and STL artifacts are attached. Supplier should review the geometry",
    "and quote for manufacturing based on the design intent above.",
  ]

  const titleBase = concept.trim().slice(0, 80)
  const title = `${titleBase} — Mashup RFQ`

  const rfqResult = await createNewRFQ({
    title,
    rfq_type: "custom",
    category: "Custom Manufacturing",
    specifications: {
      description: descriptionLines.join("\n"),
      attachments,
      custom_fields: {
        source: "the-forge-mashup-lab",
        mashup_concept: concept.trim(),
        mashup_strategy: strategy ?? null,
        source_files: sources.map((s) => s.name),
        source_count: sources.length,
      },
    },
  })

  if (rfqResult.error || !rfqResult.data?.id) {
    return { error: rfqResult.error || "Failed to create RFQ from mashup." }
  }

  return { rfqId: rfqResult.data.id }
}
