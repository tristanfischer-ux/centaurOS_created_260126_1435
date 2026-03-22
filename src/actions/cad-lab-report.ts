"use server"

/**
 * @file cad-lab-report.ts — Two-phase AI report narration pipeline.
 *
 * @description Phase 1 (Opus 4.6) reads all design data and creates a structured
 * report outline. Phase 2 (Gemini 3.1 Pro) writes polished prose for each section
 * in parallel. Falls back to data-dump export if AI fails.
 *
 * DECISION: Two separate server actions so the dialog can show real progress
 * between phases (structuring → writing → formatting).
 *
 * @security Server-side only, uses admin API keys.
 *
 * @related
 * - src/lib/cad-lab/design-report-types.ts — ReportOutline, AiReportContent types
 * - src/app/(platform)/the-forge/cad-lab/components/design-report-dialog.tsx — UI consumer
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { withRetry } from "@/lib/retry"
import type {
  DesignReportData,
  ReportOutline,
  AiReportContent,
  AiReportSection,
  ReportSectionOutline,
} from "@/lib/cad-lab/design-report-types"

// ─── Payload Optimization ────────────────────────────────────────────

// INTENT: Server actions receive data via React Flight serialization.
// Strip fields only needed client-side (image URLs, large blobs) to stay
// well under the serialization depth/size limits. See forgeos-rules.md rule #5.

function stripForServer(data: DesignReportData): DesignReportData {
  return {
    ...data,
    // Strip heroImageUrl — only used by client-side DOCX/PPTX builders
    heroImageUrl: null,
    // Strip module imageUrl — only used by client-side builders, not needed for narration
    modules: data.modules.map((m) => ({
      ...m,
      imageUrl: undefined,
    })),
    // Strip unifiedCadResult heavy fields — only text data needed for report narration
    unifiedCadResult: data.unifiedCadResult ? {
      ...data.unifiedCadResult,
      stepUrl: undefined,
      stlUrl: undefined,
      glbUrl: undefined,
      stepData: undefined,
      stlData: undefined,
      svgIso: undefined,
      svgTop: undefined,
      svgFront: undefined,
      svgBack: undefined,
      svgRight: undefined,
      svgLeft: undefined,
      svgExploded: undefined,
      code: undefined,
    } : data.unifiedCadResult,
  }
}

// ─── Data Truncation Helpers ─────────────────────────────────────────

function truncateStr(text: string | undefined | null, max: number): string {
  if (!text) return ""
  return text.length <= max ? text : text.slice(0, max) + "..."
}

function buildDataSummary(data: DesignReportData): string {
  const lines: string[] = []

  lines.push(`PROJECT: ${data.projectName}`)
  lines.push(`STAGE: ${data.stage}`)

  if (data.productOverview) {
    lines.push(`\nPRODUCT OVERVIEW:\n${truncateStr(data.productOverview, 500)}`)
  }

  if (data.researchReport) {
    lines.push(`\nRESEARCH FINDINGS:\n${truncateStr(data.researchReport, 4000)}`)
  }

  if (data.designBrief) {
    const brief = data.designBrief
    const briefParts: string[] = []
    if (brief.useCase) briefParts.push(`Use Case: ${brief.useCase}`)
    if (brief.targetProcess) briefParts.push(`Process: ${brief.targetProcess}`)
    if (brief.targetMaterial) briefParts.push(`Material: ${brief.targetMaterial}`)
    if (brief.toleranceTarget) briefParts.push(`Tolerance: ${brief.toleranceTarget}`)
    if (brief.quantityTarget) briefParts.push(`Quantity: ${brief.quantityTarget}`)
    if (brief.complianceNotes) briefParts.push(`Compliance: ${brief.complianceNotes}`)
    if (briefParts.length > 0) {
      lines.push(`\nDESIGN BRIEF:\n${briefParts.join("\n")}`)
    }
  }

  if (data.modules.length > 0) {
    lines.push(`\nMODULES (${data.modules.length}):`)
    for (const mod of data.modules) {
      lines.push(`- ${mod.name}: ${truncateStr(mod.purpose, 200)}`)
      if (mod.keyParts?.length) lines.push(`  Key parts: ${mod.keyParts.join(", ")}`)
      if (mod.failureModes?.length) lines.push(`  Failure modes: ${mod.failureModes.join(", ")}`)
      if (mod.estimatedMassKg != null) lines.push(`  Mass: ${mod.estimatedMassKg} kg`)
      if (mod.leadWeeks != null) lines.push(`  Lead: ${mod.leadWeeks} weeks`)
    }
  }

  // Diagnostic answers
  const diagIds = Object.keys(data.diagnosticAnswers)
  if (diagIds.length > 0) {
    lines.push("\nSPECIFICATIONS:")
    for (const moduleId of diagIds) {
      const mod = data.modules.find((m) => m.id === moduleId)
      const answers = data.diagnosticAnswers[moduleId]
      if (!mod || !answers) continue
      lines.push(`  ${mod.name}: process=${answers.mfg_process ?? "?"}, material=${answers.material ?? "?"}, tolerance=${answers.tolerance ?? "?"}, finish=${answers.finish ?? "?"}, batch=${answers.batch_size ?? "?"}`)
    }
  }

  // Cost estimates
  const costIds = Object.keys(data.aiCostEstimates)
  if (costIds.length > 0) {
    lines.push("\nCOST ESTIMATES:")
    for (const moduleId of costIds) {
      const mod = data.modules.find((m) => m.id === moduleId)
      const est = data.aiCostEstimates[moduleId]
      if (!mod || !est) continue
      lines.push(`  ${mod.name}: £${est.totalPerUnit.toFixed(2)} (${est.confidence} confidence)`)
      if (est.assumptions?.length) lines.push(`    Assumptions: ${est.assumptions.join("; ")}`)
    }
  }

  // Stage-specific data
  if (data.moduleReviews) {
    const reviewIds = Object.keys(data.moduleReviews)
    if (reviewIds.length > 0) {
      lines.push("\nSPECIALIST REVIEWS:")
      for (const moduleId of reviewIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const reviews = data.moduleReviews[moduleId]
        if (!mod || !reviews) continue
        for (const r of reviews) {
          lines.push(`  ${mod.name} — ${r.specialistName}: ${r.verdict.toUpperCase()}`)
          if (r.summary) lines.push(`    ${truncateStr(r.summary, 300)}`)
          if (r.recommendations?.length) lines.push(`    Recommendations: ${r.recommendations.join("; ")}`)
        }
      }
    }
  }

  if (data.classifiedParts?.length) {
    lines.push("\nPART CLASSIFICATION:")
    for (const p of data.classifiedParts) {
      lines.push(`  ${p.partName} (${p.moduleName}): ${p.type.toUpperCase()} — ${p.reasons.join("; ")}`)
    }
  }

  if (data.supplierMatches) {
    const matchIds = Object.keys(data.supplierMatches)
    if (matchIds.length > 0) {
      lines.push("\nSUPPLIER MATCHES:")
      for (const moduleId of matchIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const matches = data.supplierMatches[moduleId]
        if (!mod || !matches) continue
        for (const m of matches.slice(0, 3)) {
          lines.push(`  ${mod.name}: ${m.providerName} (score: ${m.matchScore}) — ${m.matchReasons.join(", ")}`)
        }
      }
    }
  }

  if (data.assemblyPartners?.length) {
    lines.push("\nASSEMBLY PARTNERS:")
    for (const p of data.assemblyPartners) {
      lines.push(`  ${p.name} (score: ${p.score}) — ${p.reasons.join("; ")}`)
    }
  }

  if (data.brandingNotes) lines.push(`\nBRANDING: ${data.brandingNotes}`)
  if (data.shippingNotes) lines.push(`\nSHIPPING: ${data.shippingNotes}`)

  if (data.unifiedCadResult?.success) {
    const r = data.unifiedCadResult
    lines.push("\nCAD OUTPUT:")
    if (r.massGrams != null) lines.push(`  Mass: ${r.massGrams.toFixed(1)} g`)
    if (r.volumeMm3 != null) lines.push(`  Volume: ${r.volumeMm3.toFixed(1)} mm³`)
    if (r.bbox) lines.push(`  BBox: ${r.bbox.xLen.toFixed(1)} × ${r.bbox.yLen.toFixed(1)} × ${r.bbox.zLen.toFixed(1)} mm`)
    if (r.modelUsed) lines.push(`  Model: ${r.modelUsed}`)
  }

  return lines.join("\n")
}

// ─── Extract JSON from AI response ───────────────────────────────────

function extractJson(text: string): string {
  // GOTCHA: Opus often wraps JSON in ```json ... ``` — must strip fences first.
  // Also strip single-line // comments and trailing commas (same as extractJsonObject in cad-lab.ts).
  let cleaned = text.trim()
  cleaned = cleaned.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "")
  cleaned = cleaned.replace(/^\s*\/\/.*$/gm, "")
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1")

  const first = cleaned.indexOf("{")
  const last = cleaned.lastIndexOf("}")
  if (first !== -1 && last > first) {
    return cleaned.slice(first, last + 1)
  }
  return cleaned
}

// ─── Phase 1: Opus Structures ────────────────────────────────────────

const STAGE_CONTEXT: Record<string, string> = {
  concept: "This is an early concept report. Focus on the product vision, research insights, and module decomposition.",
  specify: "This is a specification report. Emphasise diagnostic specifications, specialist review findings, and cost estimates.",
  source: "This is a sourcing report. Highlight part classification (buy vs make), supplier matching results, and technique recommendations.",
  assemble: "This is an assembly report. Focus on assembly partner selection, convergence flow, branding/packaging, and shipping logistics.",
  cad: "This is a CAD report. Emphasise the 3D model output — mass, volume, bounding box — alongside the design journey.",
}

/**
 * Phase 1: Opus reads all design data and creates a structured report outline.
 *
 * @param data - The full DesignReportData assembled by the dialog
 * @returns ReportOutline — structured sections for Gemini to write
 */
export async function structureReportOutline(
  rawData: DesignReportData,
): Promise<{ outline: ReportOutline; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const data = stripForServer(rawData)
  const dataSummary = buildDataSummary(data)
  const stageContext = STAGE_CONTEXT[data.stage] ?? ""

  const systemPrompt = `You are a senior engineering report architect at Fractional Forge. Your job is to read raw design data and create a structured report outline that a technical writer will use to write polished prose.

${stageContext}

Rules:
- Create sections that tell a coherent narrative about this product's design journey
- The executive summary should be 2-3 sentences capturing the essence of the project
- Each section brief should be 2-4 sentences instructing the writer what to emphasise
- Include all relevant data — don't skip sections that have data
- Set includeTable: true for sections where tabular data would help (specs, costs, supplier comparisons)
- Set includeImage: true for module detail sections that have images
- Set moduleId for module-specific sections so the writer can reference the right module data
- Never mention that this report was written by AI or that you are structuring it
- Return valid JSON matching the schema exactly`

  const userPrompt = `Create a structured report outline for the following design data. Return a JSON object matching this schema:

{
  "executiveSummary": "2-3 sentence summary of the project",
  "narrativeThread": "One sentence describing the story connecting all sections",
  "sections": [
    {
      "id": "unique-section-id",
      "title": "Section Title",
      "sectionType": "one of: executive-summary, product-overview, research-findings, module-overview, module-detail, specifications, cost-analysis, specialist-reviews, part-classification, supplier-analysis, assembly-logistics, cad-output, conclusions",
      "brief": "2-4 sentence instruction for the writer about what to emphasise in this section",
      "keyPoints": ["key point 1", "key point 2"],
      "dataHighlights": ["specific number or fact to reference"],
      "includeTable": false,
      "includeImage": false,
      "moduleId": "optional module ID for module-specific sections"
    }
  ]
}

DATA:
${dataSummary}`

  const response = await withRetry(
    () => fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 4096,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      },
      60_000,
    ),
    {
      maxRetries: 2,
      baseDelay: 2000,
      shouldRetry: (error) => {
        const msg = error.message.toLowerCase()
        return msg.includes('429') || msg.includes('502') || msg.includes('503') ||
          msg.includes('network') || msg.includes('timeout') || msg.includes('529')
      },
    },
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Opus API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const result = await response.json()
  const text: string = result.content?.[0]?.text ?? ""
  const tokensIn: number = result.usage?.input_tokens ?? 0
  const tokensOut: number = result.usage?.output_tokens ?? 0

  const jsonStr = extractJson(text)
  let outline: ReportOutline
  try {
    outline = JSON.parse(jsonStr)
  } catch (parseErr) {
    console.error("[CAD-REPORT] Opus returned invalid JSON:", text.slice(0, 500))
    throw new Error("Failed to parse report outline — Opus returned invalid JSON")
  }

  // GOTCHA: Validate minimum structure to avoid downstream crashes
  if (!outline.sections || !Array.isArray(outline.sections) || outline.sections.length === 0) {
    throw new Error("Report outline has no sections")
  }

  // INTENT: Default missing fields per section instead of crashing — a partially-correct
  // outline still produces a useful report. Opus sometimes omits optional fields.
  outline.sections = outline.sections.map((s, i) => ({
    id: s.id ?? `section-${i}`,
    title: s.title ?? `Section ${i + 1}`,
    sectionType: s.sectionType ?? 'conclusions',
    brief: s.brief ?? '',
    keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints : [],
    dataHighlights: Array.isArray(s.dataHighlights) ? s.dataHighlights : [],
    includeTable: s.includeTable ?? false,
    includeImage: s.includeImage ?? false,
    moduleId: s.moduleId,
  }))
  outline.executiveSummary ??= ''
  outline.narrativeThread ??= ''

  return { outline, tokensIn, tokensOut }
}

// ─── Phase 2: Gemini Writes Sections ─────────────────────────────────

function buildSectionDataSlice(section: ReportSectionOutline, data: DesignReportData): string {
  const lines: string[] = []

  switch (section.sectionType) {
    case "executive-summary":
      lines.push(`Product: ${data.projectName}`)
      if (data.productOverview) lines.push(`Overview: ${truncateStr(data.productOverview, 500)}`)
      lines.push(`Stage: ${data.stage}`)
      lines.push(`Modules: ${data.modules.length}`)
      break

    case "product-overview":
      if (data.productOverview) lines.push(data.productOverview)
      if (data.designBrief) {
        const b = data.designBrief
        if (b.useCase) lines.push(`Use Case: ${b.useCase}`)
        if (b.targetProcess) lines.push(`Process: ${b.targetProcess}`)
        if (b.targetMaterial) lines.push(`Material: ${b.targetMaterial}`)
        if (b.toleranceTarget) lines.push(`Tolerance: ${b.toleranceTarget}`)
        if (b.quantityTarget) lines.push(`Quantity: ${b.quantityTarget}`)
        if (b.complianceNotes) lines.push(`Compliance: ${b.complianceNotes}`)
      }
      break

    case "research-findings":
      if (data.researchReport) lines.push(truncateStr(data.researchReport, 4000))
      if (data.sources.length > 0) {
        lines.push("\nSources:")
        for (const s of data.sources.slice(0, 10)) {
          lines.push(`- ${s.title}: ${s.url}`)
        }
      }
      break

    case "module-overview":
      for (const mod of data.modules) {
        lines.push(`${mod.name}: ${truncateStr(mod.purpose, 200)}`)
        if (mod.estimatedMassKg != null) lines.push(`  Mass: ${mod.estimatedMassKg} kg`)
        if (mod.leadWeeks != null) lines.push(`  Lead: ${mod.leadWeeks} weeks`)
      }
      break

    case "module-detail": {
      const mod = section.moduleId ? data.modules.find((m) => m.id === section.moduleId) : null
      if (mod) {
        lines.push(`Name: ${mod.name}`)
        lines.push(`Purpose: ${mod.purpose}`)
        if (mod.description) lines.push(`Description: ${truncateStr(mod.description, 500)}`)
        if (mod.keyParts?.length) lines.push(`Key Parts: ${mod.keyParts.join(", ")}`)
        if (mod.failureModes?.length) lines.push(`Failure Modes: ${mod.failureModes.join(", ")}`)
        if (mod.estimatedMassKg != null) lines.push(`Mass: ${mod.estimatedMassKg} kg`)
        if (mod.leadWeeks != null) lines.push(`Lead Time: ${mod.leadWeeks} weeks`)
        if (mod.inputs?.length) lines.push(`Inputs: ${mod.inputs.join(", ")}`)
        if (mod.outputs?.length) lines.push(`Outputs: ${mod.outputs.join(", ")}`)
      }
      break
    }

    case "specifications": {
      const diagIds = Object.keys(data.diagnosticAnswers)
      for (const moduleId of diagIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const answers = data.diagnosticAnswers[moduleId]
        if (!mod || !answers) continue
        const parts = Object.entries(answers).map(([k, v]) => `${k}=${v}`).join(", ")
        lines.push(`${mod.name}: ${parts}`)
      }
      break
    }

    case "cost-analysis": {
      const costIds = Object.keys(data.aiCostEstimates)
      for (const moduleId of costIds) {
        const mod = data.modules.find((m) => m.id === moduleId)
        const est = data.aiCostEstimates[moduleId]
        if (!mod || !est) continue
        lines.push(`${mod.name}: £${est.totalPerUnit.toFixed(2)} (${est.confidence})`)
        if (est.assumptions?.length) lines.push(`  Assumptions: ${est.assumptions.join("; ")}`)
      }
      break
    }

    case "specialist-reviews":
      if (data.moduleReviews) {
        for (const [moduleId, reviews] of Object.entries(data.moduleReviews)) {
          const mod = data.modules.find((m) => m.id === moduleId)
          if (!mod) continue
          for (const r of reviews) {
            lines.push(`${mod.name} — ${r.specialistName}: ${r.verdict.toUpperCase()}`)
            if (r.summary) lines.push(`  ${truncateStr(r.summary, 300)}`)
            if (r.recommendations?.length) lines.push(`  Recommendations: ${r.recommendations.join("; ")}`)
          }
        }
      }
      break

    case "part-classification":
      if (data.classifiedParts) {
        for (const p of data.classifiedParts) {
          lines.push(`${p.partName} (${p.moduleName}): ${p.type.toUpperCase()} — ${p.reasons.join("; ")}`)
        }
      }
      break

    case "supplier-analysis":
      if (data.supplierMatches) {
        for (const [moduleId, matches] of Object.entries(data.supplierMatches)) {
          const mod = data.modules.find((m) => m.id === moduleId)
          if (!mod) continue
          for (const m of matches.slice(0, 3)) {
            lines.push(`${mod.name}: ${m.providerName} (score: ${m.matchScore}) — ${m.matchReasons.join(", ")}`)
          }
        }
      }
      break

    case "assembly-logistics":
      if (data.assemblyPartners?.length) {
        lines.push("Assembly Partners:")
        for (const p of data.assemblyPartners) {
          lines.push(`  ${p.name} (score: ${p.score}) — ${p.reasons.join("; ")}`)
        }
      }
      if (data.brandingNotes) lines.push(`Branding: ${data.brandingNotes}`)
      if (data.shippingNotes) lines.push(`Shipping: ${data.shippingNotes}`)
      break

    case "cad-output":
      if (data.unifiedCadResult?.success) {
        const r = data.unifiedCadResult
        if (r.massGrams != null) lines.push(`Mass: ${r.massGrams.toFixed(1)} g`)
        if (r.volumeMm3 != null) lines.push(`Volume: ${r.volumeMm3.toFixed(1)} mm³`)
        if (r.bbox) lines.push(`BBox: ${r.bbox.xLen.toFixed(1)} × ${r.bbox.yLen.toFixed(1)} × ${r.bbox.zLen.toFixed(1)} mm`)
        if (r.modelUsed) lines.push(`Model: ${r.modelUsed}`)
      }
      break

    case "conclusions":
      lines.push(`Project: ${data.projectName}`)
      lines.push(`Modules: ${data.modules.length}`)
      lines.push(`Stage: ${data.stage}`)
      break
  }

  return lines.join("\n") || "No data available for this section."
}

async function writeOneSection(
  section: ReportSectionOutline,
  data: DesignReportData,
  apiKey: string,
): Promise<AiReportSection & { tokensIn: number; tokensOut: number }> {
  const dataSlice = buildSectionDataSlice(section, data)

  const systemPrompt = `You are a technical writer at Fractional Forge, writing a section of an engineering design report. Write polished, professional prose that a hardware engineer would expect to read.

Rules:
- Write 2-4 paragraphs of clear, factual prose
- Reference specific numbers, dimensions, and data points from the provided data
- Use professional engineering language — concise, authoritative, no fluff
- Never mention that this was written by an AI or automated system
- Do not use markdown headers — the section title is already handled
- You may use **bold** for emphasis and bullet lists where appropriate`

  const userPrompt = `Section: "${section.title}"
Type: ${section.sectionType}

Writer's brief: ${section.brief}

Key points to cover:
${(section.keyPoints ?? []).map((p) => `- ${p}`).join("\n")}

Data highlights to reference:
${(section.dataHighlights ?? []).map((d) => `- ${d}`).join("\n")}

Raw data for this section:
${dataSlice}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.4,
        },
      }),
    },
    30_000,
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const result = await response.json()
  const text: string = result.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const usage = result.usageMetadata ?? {}

  return {
    id: section.id,
    title: section.title,
    sectionType: section.sectionType,
    prose: text,
    keyPoints: section.keyPoints ?? [],
    includeTable: section.includeTable ?? false,
    includeImage: section.includeImage ?? false,
    moduleId: section.moduleId,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  }
}

/**
 * Phase 2: Gemini writes prose for all sections in parallel.
 *
 * @param outline - The structured outline from Phase 1
 * @param data - The full DesignReportData
 * @returns AiReportContent — prose for each section, token usage
 */
export async function writeReportSections(
  outline: ReportOutline,
  rawData: DesignReportData,
  opusTokens: { in: number; out: number },
): Promise<AiReportContent> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured")

  const data = stripForServer(rawData)

  // INTENT: Batch sections into chunks of 4 with 1s delay between batches
  // to avoid Gemini rate limits (429). Each call wrapped in retry with
  // exponential backoff on transient errors.
  const BATCH_SIZE = 4
  const BATCH_DELAY_MS = 1000
  const results: PromiseSettledResult<AiReportSection & { tokensIn: number; tokensOut: number }>[] = []
  for (let i = 0; i < outline.sections.length; i += BATCH_SIZE) {
    const batch = outline.sections.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map((section) =>
        withRetry(() => writeOneSection(section, data, apiKey), {
          maxRetries: 3,
          baseDelay: 1000,
          shouldRetry: (error) => {
            const msg = error.message.toLowerCase()
            return msg.includes('429') || msg.includes('502') || msg.includes('503') ||
              msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset')
          },
        }),
      ),
    )
    results.push(...batchResults)
    if (i + BATCH_SIZE < outline.sections.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  let geminiIn = 0
  let geminiOut = 0

  const sections: AiReportSection[] = results.map((result, idx) => {
    const section = outline.sections[idx]
    if (result.status === "fulfilled") {
      geminiIn += result.value.tokensIn
      geminiOut += result.value.tokensOut
      return {
        id: result.value.id,
        title: result.value.title,
        sectionType: result.value.sectionType,
        prose: result.value.prose,
        keyPoints: result.value.keyPoints,
        includeTable: result.value.includeTable,
        includeImage: result.value.includeImage,
        moduleId: result.value.moduleId,
      }
    }
    // INTENT: Failed sections get empty prose — builder falls back to raw data dump
    console.error(`[CAD-REPORT] Section "${section.title}" failed:`, result.reason)
    return {
      id: section.id,
      title: section.title,
      sectionType: section.sectionType,
      prose: "",
      keyPoints: section.keyPoints ?? [],
      includeTable: section.includeTable ?? false,
      includeImage: section.includeImage ?? false,
      moduleId: section.moduleId,
    }
  })

  return {
    executiveSummary: outline.executiveSummary,
    sections,
    generatedAt: new Date().toISOString(),
    opusTokens,
    geminiTokens: { in: geminiIn, out: geminiOut },
  }
}
