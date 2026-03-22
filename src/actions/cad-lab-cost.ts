"use server"

/**
 * @file cad-lab-cost.ts — AI-powered first-principles cost estimation.
 *
 * @description Calls Claude Haiku to produce per-module, per-part cost
 * breakdowns with brief reasoning. The AI reads each module's keyParts
 * and diagnostics, classifies parts as "buy" or "make", estimates costs,
 * and adds assembly/integration labour.
 *
 * GOTCHA: With 9+ modules, verbose prompts cause 90s+ responses and
 * token-limit truncation. Keep module summaries compact (keyParts +
 * diagnostics only, no description/failureModes) and instruct Haiku
 * to keep reasoning under 15 words per part. Tested: 9 modules in ~22s.
 *
 * @security Requires ANTHROPIC_API_KEY environment variable.
 */

import type { AiCostEstimate, CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { ProcessInsights } from "@/actions/manufacturing-techniques"
import { classifyPart } from "@/lib/part-classification"
import { withAIGate } from '@/lib/ai/with-ai-gate'

// ─── Types ────────────────────────────────────────────────────────────

interface EstimateResult {
  success: true
  estimates: Record<string, AiCostEstimate>
}

interface EstimateError {
  success: false
  error: string
}

// ─── Main Action ──────────────────────────────────────────────────────

/**
 * Estimates manufacturing costs for all modules using Claude Haiku.
 *
 * @description Sends compact module specs (keyParts + diagnostics) to
 * Claude Haiku. The AI produces a parts-level cost breakdown: each part
 * classified as buy/make with individual cost and brief reasoning, plus
 * assembly labour estimate.
 *
 * @param modules - Decomposed modules with context
 * @param diagnosticAnswers - Per-module diagnostic answers (6 dimensions)
 * @param researchExcerpt - First 2000 chars of research report for product context
 * @param productOverview - Optional user-edited product overview
 * @param techniqueInsights - Optional real-world insights keyed by process name
 * @returns Record of AiCostEstimate keyed by moduleId, or error
 */
export async function estimateModuleCostsAi(
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
  researchExcerpt: string,
  productOverview?: string,
  techniqueInsights?: Record<string, ProcessInsights>,
): Promise<EstimateResult | EstimateError> {
  return withAIGate('cad_lab_cost', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return { success: false, error: "ANTHROPIC_API_KEY not configured" }
  }

  if (modules.length === 0) {
    return { success: false, error: "No modules to estimate" }
  }

  // DECISION: Compact summaries — keyParts + diagnostics only, no description/failureModes.
  // Full descriptions caused 90s+ responses and token-limit truncation with 9 modules.
  const moduleSummaries = modules.map((mod) => {
    const answers = diagnosticAnswers[mod.id] || {}
    const process = answers.mfg_process || "Not specified"

    // INTENT: Inject compact real-world context (~100 tokens) when technique insights
    // are available. Grounds Haiku's estimates using actual supplier data.
    const insights = techniqueInsights?.[process]
    const realWorldContext = insights
      ? {
          supplierCount: insights.totalSupplierCount,
          typicalTolerance_mm: insights.tolerances.typical_mm,
          topMaterials: insights.materials.slice(0, 3).map((m) => m.material),
          batchSizes: insights.batchSizes,
          equipment: insights.equipment.slice(0, 3).map((e) => e.brand_model),
        }
      : undefined

    return {
      id: mod.id,
      name: mod.name,
      keyParts: mod.keyParts,
      diagnostics: {
        mfg_process: process,
        material: answers.material || "Not specified",
        tolerance: answers.tolerance || "Not specified",
        finish: answers.finish || "Not specified",
        environment: answers.environment || "Not specified",
        batch_size: answers.batch_size || "Not specified",
      },
      ...(realWorldContext && { realWorldContext }),
    }
  })

  const systemPrompt = `You are a UK manufacturing cost estimation expert. Costs in GBP (£).

For each module: list parts as "buy" or "make" with cost and SHORT reasoning (under 15 words per part). Add labour at £40/hr.

IMPORTANT: The module-level "mfg_process" tells you the PRIMARY manufacturing method for custom parts in that module. It does NOT mean every part is "make" — many parts in every module are standard buy items. Classify EACH part individually.

Example — a module with mfg_process "Sheet Metal" might produce:
  sheet metal enclosure (make, Sheet Metal, Mild Steel)
  M6 cap screws ×12 (buy)
  proximity sensor (buy)
  waterproof cable gland (buy)
  stainless shaft (make, CNC Machining, Stainless 304)

A module with mfg_process "Manual/Assembly" still has make parts — classify by their ACTUAL process:
  welded frame (make, Welding, Mild Steel)
  machined pivot block (make, CNC Machining, Aluminum 6061)
  toggle switches ×4 (buy)

EVERY module should have BOTH buy and make parts. If you find yourself classifying all parts in a module as "make" with the same process, you are probably wrong.

RULES:
- Buy parts: UK 2026 market price (RS Components, Farnell)
- Make parts: process + material + complexity from diagnostics
- Group identical parts: "M6 cap screws (×8)" with combined cost
- Reference: mild steel ~£1.50/kg, aluminium 6061 ~£8/kg, stainless 304 ~£6/kg
- Confidence: "high" only when parts are standard/well-understood
- Keep ALL reasoning BRIEF — under 15 words each
- When realWorldContext is provided, ground estimates using: supplierCount as market depth, equipment to determine cost tier, topMaterials for realistic material grades

BUY vs MAKE classification:
- "buy" = any COTS/off-the-shelf part: motors, stepper motors, servos, sensors, switches, batteries, power supplies, microcontrollers, PCBs, Arduino/Raspberry Pi, cables, connectors, bearings, linear rails, lead screws, belts, pulleys, gears, fasteners (bolts, screws, nuts, washers), seals, O-rings, springs, fans, pumps, valves, displays, LEDs, cameras, encoders, drivers, ESCs
- "make" = custom manufactured: machined housings, welded frames, sheet metal brackets, cast parts, moulded plastics, custom PCBs, fabricated enclosures

For each "make" part, specify process (e.g. "CNC Machining", "Sheet Metal", "Injection Moulding", "Welding", "3D Printing", "Casting") and material (e.g. "Aluminum 6061", "Mild Steel", "Stainless 304", "ABS", "Nylon"). Each make part should have its OWN process/material — do not assume all parts in a module share the same process.

CRITICAL: Return ONLY valid JSON, no markdown fences.
{
  "estimates": {
    "<moduleId>": {
      "moduleId": "<moduleId>",
      "parts": [{ "name": "<part>", "type": "buy"|"make", "cost": <number>, "reasoning": "<brief>", "process": "<make only>", "material": "<make only>" }],
      "labourCost": <number>,
      "labourReasoning": "<brief>",
      "totalPerUnit": <number>,
      "confidence": "low"|"medium"|"high",
      "assumptions": ["<brief>"],
      "reasoning": "<1 sentence>"
    }
  }
}`

  const userPrompt = `Estimate costs for these ${modules.length} modules. Be CONCISE.
${productOverview ? `\nProduct: ${productOverview.slice(0, 200)}\n` : ""}
MODULES:
${JSON.stringify(moduleSummaries, null, 2)}

Return ONLY valid JSON.`

  try {
    // DECISION: Anthropic SDK instead of fetchWithTimeout — AbortController is unreliable
    // in Next.js server actions (see memory: "AbortSignal.timeout() is unreliable").
    // SDK handles connection management; Vercel's 300s maxDuration is the natural ceiling.
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text: string = response.content[0]?.type === "text" ? response.content[0].text : ""

    if (!text) {
      return { success: false, error: "Empty response from Claude" }
    }

    // Parse JSON — strip markdown fences if present
    let jsonStr = text.trim()
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "")
    jsonStr = jsonStr.replace(/\s*```\s*$/i, "")
    jsonStr = jsonStr.trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error("[CAD-LAB-COST] JSON parse failed. Raw text (first 500 chars):", text.slice(0, 500))
      console.error("[CAD-LAB-COST] Raw text (last 200 chars):", text.slice(-200))
      return { success: false, error: "Failed to parse AI response as JSON" }
    }
    const estimates: Record<string, AiCostEstimate> = (parsed.estimates as Record<string, AiCostEstimate>) ?? (parsed as unknown as Record<string, AiCostEstimate>)

    // Validate each estimate
    for (const mod of modules) {
      const est = estimates[mod.id]
      if (!est) continue
      est.moduleId = mod.id
      if (!["low", "medium", "high"].includes(est.confidence)) {
        est.confidence = "medium"
      }
      if (!Array.isArray(est.assumptions)) est.assumptions = []
      if (!Array.isArray(est.parts)) est.parts = []
      est.parts = est.parts.filter(
        (p) => p && typeof p.name === "string" && typeof p.cost === "number"
      )
      for (const part of est.parts) {
        if (part.type !== "buy" && part.type !== "make") part.type = "make"
        // Preserve per-part process/material for make parts, strip from buy parts
        if (part.type === "buy") {
          delete part.process
          delete part.material
        } else {
          if (typeof part.process !== "string" || !part.process) delete part.process
          if (typeof part.material !== "string" || !part.material) delete part.material
        }
      }
      // INTENT: Safety net — shared classifyPart() overrides AI when explicit keyword match found.
      // DECISION: "make wins" on dual-match (consistent with Sankey). See part-classification.ts.
      const diag = diagnosticAnswers[mod.id]
      for (const part of est.parts) {
        const cls = classifyPart(part.name, diag?.mfg_process || "Manual/Assembly", diag?.material || "Other")
        if (cls.explicit) {
          if (cls.type === "buy") { part.type = "buy"; delete part.process; delete part.material }
          else {
            part.type = "make"
            // DECISION: Text-detected values override AI (same logic as sankey-utils.ts)
            part.process = cls.processDetected ? cls.process : (part.process || cls.process)
            part.material = cls.materialDetected ? cls.material : (part.material || cls.material)
          }
        }
      }

      if (typeof est.labourCost !== "number") est.labourCost = 0
      if (typeof est.labourReasoning !== "string") est.labourReasoning = ""
      if (typeof est.totalPerUnit !== "number" || est.totalPerUnit <= 0) {
        const partsCost = est.parts.reduce((s, p) => s + p.cost, 0)
        est.totalPerUnit = partsCost + (est.labourCost ?? 0)
      }
    }

    console.info("[CAD-LAB-COST] AI estimates produced for", Object.keys(estimates).length, "modules",
      `(${response.usage?.input_tokens ?? 0} in / ${response.usage?.output_tokens ?? 0} out)`)

    // Log category distribution for debugging
    const allParts = Object.values(estimates).flatMap(e => e.parts ?? [])
    const buyCount = allParts.filter(p => p.type === "buy").length
    const makeCount = allParts.filter(p => p.type === "make").length
    const processes = new Set(allParts.filter(p => p.type === "make").map(p => p.process).filter(Boolean))
    console.info(`[CAD-LAB-COST] Distribution: ${buyCount} buy, ${makeCount} make, ${processes.size} unique processes: ${[...processes].join(", ")}`)
    if (buyCount === 0) console.warn("[CAD-LAB-COST] WARNING: Zero buy parts detected — prompt may need strengthening")

    return { success: true, estimates }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[CAD-LAB-COST] AI estimation failed:", msg)
    return { success: false, error: msg }
  }
  })
}
