"use server"

/**
 * @file cad-lab-cost.ts — AI-powered cost estimation for The Forge modules.
 *
 * @description Calls Claude Haiku to produce structured per-module cost
 * breakdowns with reasoning, replacing generic formula-based estimates.
 * Uses the same fetchWithTimeout pattern as cad-lab.ts for reliable timeouts.
 *
 * @security Requires ANTHROPIC_API_KEY environment variable.
 */

import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import type { AiCostEstimate, CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import {
  MATERIAL_COST_PER_KG,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  TOLERANCE_MULTIPLIER,
  FINISH_MULTIPLIER,
  ENVIRONMENT_MULTIPLIER,
} from "@/lib/cad-lab-cost-constants"

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
 * @description Sends module summaries + diagnostic answers + research context
 * to Claude Haiku and receives structured JSON cost breakdowns with reasoning.
 * Falls back gracefully — caller should keep formulaic estimates on failure.
 *
 * @param modules - Decomposed modules with context
 * @param diagnosticAnswers - Per-module diagnostic answers (6 dimensions)
 * @param researchExcerpt - First 2000 chars of research report for product context
 * @param productOverview - Optional user-edited product overview
 * @returns Record of AiCostEstimate keyed by moduleId, or error
 */
export async function estimateModuleCostsAi(
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
  researchExcerpt: string,
  productOverview?: string,
): Promise<EstimateResult | EstimateError> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { success: false, error: "ANTHROPIC_API_KEY not configured" }
  }

  if (modules.length === 0) {
    return { success: false, error: "No modules to estimate" }
  }

  // Build module summaries for the prompt
  const moduleSummaries = modules.map((mod) => {
    const answers = diagnosticAnswers[mod.id] || {}
    return {
      id: mod.id,
      name: mod.name,
      purpose: mod.purpose,
      keyParts: mod.keyParts,
      estimatedMassKg: mod.estimatedMassKg ?? null,
      diagnostics: {
        mfg_process: answers.mfg_process || "Not specified",
        material: answers.material || "Not specified",
        tolerance: answers.tolerance || "Not specified",
        finish: answers.finish || "Not specified",
        environment: answers.environment || "Not specified",
        batch_size: answers.batch_size || "Not specified",
      },
    }
  })

  // Build calibration anchors from existing rate tables
  const calibration = {
    materialRatesGbpPerKg: MATERIAL_COST_PER_KG,
    processHourlyRates: PROCESS_HOURLY_RATE,
    hoursPerKg: HOURS_PER_KG,
    toolingCosts: TOOLING_COST,
    toleranceMultipliers: TOLERANCE_MULTIPLIER,
    finishMultipliers: FINISH_MULTIPLIER,
    environmentMultipliers: ENVIRONMENT_MULTIPLIER,
  }

  const systemPrompt = `You are a manufacturing cost estimation expert specialising in hardware product development. You estimate costs in GBP (£).

Given module specifications and diagnostic answers, produce a structured JSON cost estimate for each module. Your estimates should be realistic for UK-based manufacturing in 2026.

IMPORTANT RULES:
- Use the provided rate tables as calibration anchors, but adjust based on the specific module context
- Mass estimation should consider the module's purpose, key parts, and physical characteristics — not just keyword matching
- Tolerance, finish, and environment multipliers should reflect their real impact on manufacturing cost
- Be specific in your reasoning — reference the actual components and processes
- Confidence should be "high" only when diagnostics are complete and the module is well-understood
- All costs in GBP (£)

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "estimates": {
    "<moduleId>": {
      "moduleId": "<moduleId>",
      "estimatedMassKg": <number>,
      "massReasoning": "<why this mass — reference specific parts>",
      "materialCostPerUnit": <number>,
      "materialBreakdown": "<material × mass × rate calculation>",
      "processingCostPerUnit": <number>,
      "processingBreakdown": "<process, hours, rate, complexity factors>",
      "toolingCost": <number>,
      "toolingReasoning": "<tooling needs for this specific module>",
      "toleranceMultiplier": <number>,
      "finishMultiplier": <number>,
      "environmentMultiplier": <number>,
      "adjustmentReasoning": "<why these multipliers — reference the specs>",
      "totalPerUnit": <number>,
      "confidence": "low" | "medium" | "high",
      "assumptions": ["<assumption 1>", "<assumption 2>"]
    }
  }
}`

  const userPrompt = `Estimate manufacturing costs for these modules:

${productOverview ? `PRODUCT OVERVIEW:\n${productOverview}\n` : ""}
RESEARCH CONTEXT (excerpt):
${researchExcerpt.slice(0, 2000)}

MODULES:
${JSON.stringify(moduleSummaries, null, 2)}

CALIBRATION RATE TABLES (use as anchors, adjust per module):
${JSON.stringify(calibration, null, 2)}

Produce a JSON cost estimate for each module. Remember: return ONLY valid JSON, no markdown fences.`

  try {
    const response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      },
      30_000, // 30s timeout — Haiku is fast
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error("[CAD-LAB-COST] Claude API error:", response.status, errText.slice(0, 300))
      return { success: false, error: `Claude API error (${response.status})` }
    }

    const data = await response.json()
    const text: string = data.content?.[0]?.text ?? ""

    if (!text) {
      return { success: false, error: "Empty response from Claude" }
    }

    // Parse JSON — strip markdown fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim()
    const parsed = JSON.parse(jsonStr)
    const estimates: Record<string, AiCostEstimate> = parsed.estimates ?? parsed

    // Validate each estimate has required fields
    for (const mod of modules) {
      const est = estimates[mod.id]
      if (!est) continue
      // Ensure moduleId is set
      est.moduleId = mod.id
      // Clamp confidence to valid values
      if (!["low", "medium", "high"].includes(est.confidence)) {
        est.confidence = "medium"
      }
      // Ensure arrays
      if (!Array.isArray(est.assumptions)) {
        est.assumptions = []
      }
    }

    console.info("[CAD-LAB-COST] AI estimates produced for", Object.keys(estimates).length, "modules",
      `(${data.usage?.input_tokens ?? 0} in / ${data.usage?.output_tokens ?? 0} out)`)

    return { success: true, estimates }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[CAD-LAB-COST] AI estimation failed:", msg)
    return { success: false, error: msg }
  }
}
