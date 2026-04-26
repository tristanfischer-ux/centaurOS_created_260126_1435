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
import { withAIGate } from '@/lib/ai/with-ai-gate'
import type {
  DesignReportData,
  ReportOutline,
  AiReportContent,
  AiReportSection,
  ReportSectionOutline,
} from "@/lib/cad-lab/design-report-types"
import type { ReportAudience } from "@/lib/cad-lab/audience"
import { DEFAULT_AUDIENCE } from "@/lib/cad-lab/audience"
import {
  getAudienceOpusContext,
  getAudienceGeminiTone,
  getAudienceImagePromptSuffix,
} from "@/lib/cad-lab/prompts/audience-context"

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

  // Engineering Intelligence
  if (data.engineeringIntelligence) {
    const ei = data.engineeringIntelligence
    if (ei.standards.length > 0) {
      lines.push(`\nENGINEERING STANDARDS REFERENCED (${ei.standards.length}):`)
      if (ei.industryDomain) lines.push(`  Industry domain: ${ei.industryDomain.replace(/_/g, " ")}`)
      for (const s of ei.standards.slice(0, 10)) {
        lines.push(`  - ${s.code} (${s.issuingBody}): ${s.name}`)
      }
    }
    if (ei.materials.length > 0) {
      lines.push(`\nMATERIAL PROPERTIES (${ei.materials.length} verified):`)
      for (const m of ei.materials.slice(0, 8)) {
        lines.push(`  - ${m.code}: ρ=${m.density ?? "?"}kg/m³, σy=${m.yieldStrength ?? "?"}MPa, k=${m.thermalConductivity ?? "?"}W/(m·K), $${m.costPerKg ?? "?"}/kg`)
      }
    }
    if (ei.processes.length > 0) {
      lines.push(`\nPROCESS CAPABILITIES (${ei.processes.length}):`)
      for (const p of ei.processes) {
        lines.push(`  - ${p.displayName}: tolerance ±${p.toleranceTypical ?? "?"}mm, min wall ${p.minWall ?? "?"}mm`)
      }
    }
    if (ei.hardwareCount > 0) {
      lines.push(`  ${ei.hardwareCount} ISO metric fastener specs referenced`)
    }
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
  journey: "This is a Design Journey report — a complete chronological narrative showing how this product design evolved from initial concept through to its current state. Structure the report as a timeline: start with the research findings and product vision, then show how the design was decomposed into modules, what the specialist reviews found, how sourcing decisions were made, and where the project stands now. Use comparison slides to show how the design changed (original assumptions vs final specs), process-flow slides for the stage progression, stat-callout slides for key metrics achieved, and data-table slides for decision logs. The narrative should feel like reading a project retrospective — each section naturally leads to the next.",
}

/**
 * Phase 1: Opus reads all design data and creates a structured report outline.
 *
 * @param data - The full DesignReportData assembled by the dialog
 * @param audience - Target reader for this report — steers section order,
 *   slide layouts, and emphasis. Defaults to `investor` for back-compat.
 * @returns ReportOutline — structured sections for Gemini to write
 */
export async function structureReportOutline(
  rawData: DesignReportData,
  audience: ReportAudience = DEFAULT_AUDIENCE,
): Promise<{ outline: ReportOutline; tokensIn: number; tokensOut: number }> {
  return withAIGate('cad_lab_report', async ({ trackUsage }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")

  const data = stripForServer(rawData)
  const dataSummary = buildDataSummary(data)
  const stageContext = STAGE_CONTEXT[data.stage] ?? ""
  const audienceContext = getAudienceOpusContext(audience)

  const systemPrompt = `You are a senior engineering report architect at Fractional Forge. Your job is to read raw design data and create a visually compelling, narrative-driven report outline. Think like a McKinsey consultant designing a boardroom presentation — every slide should have a clear visual layout and tell part of a story.

${stageContext}

${audienceContext}

## Slide Layout System

For each section, choose the best visual layout from this list:

- "hero-cover" — Cover slide with hero image, title, subtitle
- "value-props" — Icon/image left, 3 stacked value-proposition cards (use for product mission/vision)
- "comparison-two-col" — Side-by-side comparison with visual contrast (use for "Legacy vs Our Approach", "Problem vs Solution")
- "data-table" — Styled comparison matrix with labeled rows (use for technology/spec comparisons across categories)
- "architecture-diagram" — AI illustration with annotation callouts and key specs sidebar (use for product architecture, exploded views)
- "process-flow" — Chevron pipeline showing sequential phases (use for manufacturing flow, design process, treatment trains)
- "stat-callouts" — 2-3 large statistics with labels, optional before/after framing (use for market size, key metrics)
- "technical-dossiers" — 3-card grid showing distinct profiles/variants (use for material options, market segments, supplier categories)
- "quadrant-chart" — 2×2 matrix with items positioned by two axes (use for priority/risk matrices, value vs effort)
- "module-detail" — Image left, specifications right (use for individual module deep-dives)
- "prose-section" — Standard text slide (use only when no visual layout fits)

For each section, also provide:
- "slideData" — structured data matching the chosen layout (see schema below)
- "imagePrompt" — (optional) a 50-100 word prompt for Nano Banana 2 to generate a custom illustration for this slide. Start with "On a pure white background, create a full-color technical illustration..." Describe the SPECIFIC diagram needed (e.g., exploded view, process flow, comparison visual). Do NOT request text/labels in the image. Only include imagePrompt for slides where a custom illustration would add value (architecture, comparisons, process flows — NOT for data tables or text slides).

Rules:
- Create 8-15 sections that tell a coherent narrative about this product's design journey
- Choose VARIED slide layouts — avoid more than 2 consecutive prose-section slides
- The executive summary should be 2-3 sentences capturing the essence of the project
- Each section brief should be 2-4 sentences instructing the writer what to emphasise
- Include all relevant data — don't skip sections that have data
- Populate slideData with REAL data from the source material — specific numbers, names, specs
- Set includeTable: true for sections where tabular data would help (specs, costs, supplier comparisons)
- Set includeImage: true for module detail sections that have images
- Set moduleId for module-specific sections so the writer can reference the right module data
- If ENGINEERING STANDARDS REFERENCED data is present, include an "engineering-standards" section
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
      "sectionType": "one of: executive-summary, product-overview, research-findings, module-overview, module-detail, specifications, cost-analysis, engineering-standards, specialist-reviews, part-classification, supplier-analysis, assembly-logistics, cad-output, conclusions",
      "brief": "2-4 sentence instruction for the writer about what to emphasise in this section",
      "keyPoints": ["key point 1", "key point 2"],
      "dataHighlights": ["specific number or fact to reference"],
      "includeTable": false,
      "includeImage": false,
      "moduleId": "optional module ID for module-specific sections",
      "slideLayout": "one of: hero-cover, value-props, comparison-two-col, data-table, architecture-diagram, process-flow, stat-callouts, technical-dossiers, quadrant-chart, module-detail, prose-section",
      "slideData": "structured data object matching the slideLayout type — populate with REAL data from source material",
      "imagePrompt": "optional 50-100 word Nano Banana 2 prompt for a custom per-slide illustration"
    }
  ]
}

slideData shapes by layout:
- hero-cover: { "layout": "hero-cover", "title": "...", "subtitle": "..." }
- value-props: { "layout": "value-props", "heading": "...", "items": [{ "label": "...", "description": "..." }] }
- comparison-two-col: { "layout": "comparison-two-col", "leftTitle": "...", "leftItems": ["..."], "rightTitle": "...", "rightDescription": "...", "rightItems": ["..."] }
- data-table: { "layout": "data-table", "heading": "...", "columns": ["Col A", "Col B"], "rows": [{ "label": "Row", "values": ["val1", "val2"] }], "footnote": "..." }
- architecture-diagram: { "layout": "architecture-diagram", "heading": "...", "annotations": [{ "label": "...", "description": "..." }], "specs": [{ "label": "...", "value": "..." }] }
- process-flow: { "layout": "process-flow", "heading": "...", "subtitle": "...", "phases": [{ "name": "Phase 1", "title": "...", "description": "..." }] }
- stat-callouts: { "layout": "stat-callouts", "leftLabel": "...", "rightLabel": "...", "stats": [{ "value": "16,000+", "label": "..." }] }
- technical-dossiers: { "layout": "technical-dossiers", "heading": "...", "cards": [{ "title": "...", "profile": "...", "items": [{ "label": "...", "value": "..." }] }] }
- quadrant-chart: { "layout": "quadrant-chart", "heading": "...", "xAxis": "...", "yAxis": "...", "items": [{ "label": "...", "x": "low|mid|high", "y": "low|mid|high" }], "insight": "..." }
- module-detail: { "layout": "module-detail", "moduleName": "...", "specs": [{ "label": "...", "value": "..." }] }
- prose-section: { "layout": "prose-section" }

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
          // Loop 8 cost cut (2026-04-26): claude-opus-4-7 → claude-sonnet-4-6
          // for the PDF report synthesis. This runs once per project per
          // regen × 6 projects. Opus → Sonnet ≈ 5× cheaper without quality
          // risk on prose synthesis (Sonnet is already used for Chase + Max
          // research at this fidelity bar).
          model: "claude-sonnet-4-6",
          max_tokens: 12288,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      },
      90_000,
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
    slideLayout: s.slideLayout ?? 'prose-section',
    slideData: s.slideData,
    imagePrompt: typeof s.imagePrompt === 'string' ? s.imagePrompt : undefined,
  }))
  outline.executiveSummary ??= ''
  outline.narrativeThread ??= ''

  await trackUsage({ model: 'claude-opus-4-7', promptTokens: tokensIn, completionTokens: tokensOut })

  return { outline, tokensIn, tokensOut }
  }) // end withAIGate
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

    case "engineering-standards":
      if (data.engineeringIntelligence) {
        const ei = data.engineeringIntelligence
        if (ei.industryDomain) lines.push(`Industry domain: ${ei.industryDomain.replace(/_/g, " ")}`)
        if (ei.standards.length > 0) {
          lines.push(`\n${ei.standards.length} design standards referenced:`)
          for (const s of ei.standards.slice(0, 10)) {
            lines.push(`- ${s.code} (${s.issuingBody}): ${s.name}`)
            if (s.summary) lines.push(`  ${s.summary.slice(0, 150)}`)
          }
        }
        if (ei.materials.length > 0) {
          lines.push(`\n${ei.materials.length} verified material specifications:`)
          for (const m of ei.materials.slice(0, 8)) {
            lines.push(`- ${m.code} (${m.name}): density=${m.density ?? "?"}kg/m³, yield=${m.yieldStrength ?? "?"}MPa, thermal=${m.thermalConductivity ?? "?"}W/(m·K), cost=$${m.costPerKg ?? "?"}/kg`)
          }
        }
        if (ei.processes.length > 0) {
          lines.push(`\n${ei.processes.length} manufacturing process constraints:`)
          for (const p of ei.processes) {
            lines.push(`- ${p.displayName}: tolerance ±${p.toleranceTypical ?? "?"}mm, min wall ${p.minWall ?? "?"}mm`)
          }
        }
        if (ei.hardwareCount > 0) {
          lines.push(`\n${ei.hardwareCount} ISO metric fastener specifications referenced`)
        }
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
  audience: ReportAudience,
): Promise<AiReportSection & { tokensIn: number; tokensOut: number }> {
  const dataSlice = buildSectionDataSlice(section, data)
  const audienceTone = getAudienceGeminiTone(audience)

  const systemPrompt = `You are a technical writer at Fractional Forge, writing a section of a design report.

${audienceTone}

Rules:
- Write 2-4 paragraphs of clear, factual prose
- Reference specific numbers, dimensions, and data points from the provided data
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
    slideLayout: section.slideLayout,
    slideData: section.slideData,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
  }
}

/**
 * Phase 2: Gemini writes prose for all sections in parallel.
 *
 * @param outline - The structured outline from Phase 1
 * @param data - The full DesignReportData
 * @param opusTokens - Token counts from Phase 1 (threaded through to content)
 * @param audience - Target reader — steers tone/register per section. Defaults to investor.
 * @returns AiReportContent — prose for each section, token usage
 */
export async function writeReportSections(
  outline: ReportOutline,
  rawData: DesignReportData,
  opusTokens: { in: number; out: number },
  audience: ReportAudience = DEFAULT_AUDIENCE,
): Promise<AiReportContent> {
  return withAIGate('cad_lab_report', async ({ trackUsage }) => {
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
        withRetry(() => writeOneSection(section, data, apiKey, audience), {
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
        slideLayout: result.value.slideLayout,
        slideData: result.value.slideData,
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
      slideLayout: section.slideLayout,
      slideData: section.slideData,
    }
  })

  await trackUsage({ model: 'gemini-3.1-pro', promptTokens: geminiIn, completionTokens: geminiOut })

  return {
    executiveSummary: outline.executiveSummary,
    sections,
    generatedAt: new Date().toISOString(),
    opusTokens,
    geminiTokens: { in: geminiIn, out: geminiOut },
  }
  }) // end withAIGate
}

// ─── Phase 2.5: Slide Image Generation ──────────────────────────────

/**
 * Generates custom illustrations for slides that have imagePrompt set.
 * Called between prose writing (Phase 2) and PPTX building (Phase 3).
 *
 * @param outline - The structured outline with imagePrompts from Phase 1
 * @param content - The written content from Phase 2 (modified in place with slideImageBase64)
 * @param audience - Target reader — selects illustration style suffix (investor → photoreal,
 *   engineer/supplier → blueprint, marketing → photography). Defaults to investor.
 * @returns The content with slideImageBase64 populated for relevant sections
 */
export async function generateSlideImages(
  outline: ReportOutline,
  content: AiReportContent,
  audience: ReportAudience = DEFAULT_AUDIENCE,
): Promise<AiReportContent> {
  return withAIGate('cad_lab_report', async () => {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim()
  if (!apiKey) {
    console.warn("[CAD-REPORT] GOOGLE_AI_API_KEY not configured, skipping slide images")
    return content
  }

  // Collect sections that need custom illustrations
  const imageJobs: { sectionIdx: number; prompt: string }[] = []
  for (let i = 0; i < outline.sections.length; i++) {
    const prompt = outline.sections[i].imagePrompt
    if (prompt && prompt.length > 20) {
      imageJobs.push({ sectionIdx: i, prompt })
    }
  }

  if (imageJobs.length === 0) return content

  console.log(`[CAD-REPORT] Generating ${imageJobs.length} slide illustrations for audience=${audience}...`)

  const styleSuffix = getAudienceImagePromptSuffix(audience)

  // INTENT: Generate all slide images in parallel for speed.
  // Each call is independent — one failure shouldn't block others.
  const results = await Promise.allSettled(
    imageJobs.map(async (job) => {
      const NO_TEXT_SUFFIX = "\n\nCRITICAL RULES:\n- ZERO text, letters, words, labels, annotations, captions, or numbers anywhere in the image\n- Full color, not grayscale"

      const fullPrompt = job.prompt + styleSuffix + NO_TEXT_SUFFIX

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${apiKey}`

      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              temperature: 0.8,
            },
          }),
        },
        30_000,
      )

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Image API error (${response.status}): ${errText.slice(0, 200)}`)
      }

      const result = await response.json()
      const parts = result.candidates?.[0]?.content?.parts ?? []
      const imagePart = parts.find((p: Record<string, unknown>) => p.inlineData)
      if (!imagePart?.inlineData?.data) {
        throw new Error("No image data in response")
      }

      return { sectionIdx: job.sectionIdx, base64: imagePart.inlineData.data as string }
    }),
  )

  // Merge results into content sections
  const updatedSections = [...content.sections]
  for (const result of results) {
    if (result.status === "fulfilled") {
      const { sectionIdx, base64 } = result.value
      if (updatedSections[sectionIdx]) {
        updatedSections[sectionIdx] = {
          ...updatedSections[sectionIdx],
          slideImageBase64: base64,
        }
      }
    } else {
      console.warn("[CAD-REPORT] Slide image generation failed:", result.reason)
    }
  }

  const successCount = results.filter((r) => r.status === "fulfilled").length
  console.log(`[CAD-REPORT] ${successCount}/${imageJobs.length} slide images generated`)

  return { ...content, sections: updatedSections }
  }) // end withAIGate
}
