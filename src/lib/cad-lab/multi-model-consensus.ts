/**
 * @file multi-model-consensus.ts
 *
 * @description Multi-model consensus for high-stakes engineering recommendations.
 * Runs the same prompt through OpenAI GPT-5.4 and optionally Gemini; returns
 * consensus value or flags disagreement with alternatives.
 *
 * @related src/actions/cad-lab.ts (prefillDiagnostics)
 */

import { callOpenRouter } from '@/lib/ai/openrouter'

export interface ConsensusResult {
  /** Agreed value when 2+ models match; null when no majority */
  consensus: string | null
  /** Per-model raw outputs for UI when disagreement */
  alternatives: Array<{ model: string; output: string }>
  /** True when at least 2 models returned the same normalized value */
  agreed: boolean
}

const MATERIAL_OPTIONS = [
  "Stainless Steel", "Steel/Iron", "PLA/PETG", "ABS/Nylon", "Aluminium",
  "Copper/Brass", "Titanium", "Carbon Fiber Composite", "CFRP/GFRP",
  "Wood/Plywood", "Silicone/Rubber", "Glass/Ceramic", "PCB/Electronic", "Other",
]

/**
 * Normalizes a model's material recommendation to one of the allowed values.
 */
function normalizeMaterial(raw: string): string {
  const lower = raw.trim().toLowerCase()
  for (const opt of MATERIAL_OPTIONS) {
    if (lower.includes(opt.toLowerCase())) return opt
  }
  return raw.trim().slice(0, 80) || "Other"
}

async function callOpenAIConsensus(systemPrompt: string, userPrompt: string): Promise<string> {
  const result = await callOpenRouter({
    model: "openai/gpt-5.4",
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 256,
    timeoutMs: 30_000,
  })
  if (!result.ok) throw new Error(result.error ?? "OpenRouter GPT-5.4 call failed")
  return (result.text ?? "").trim()
}

async function callGeminiConsensus(systemPrompt: string, userPrompt: string): Promise<string> {
  const result = await callOpenRouter({
    model: "google/gemini-3.1-pro-preview",
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 4096,
    timeoutMs: 60_000,
  })
  if (!result.ok) throw new Error(result.error ?? "OpenRouter Gemini call failed")
  return (result.text ?? "").trim()
}

/**
 * Runs a material-recommendation prompt through OpenAI GPT-5.4 (and Gemini if configured).
 * Returns consensus material or alternatives when models disagree.
 *
 * @param systemPrompt - System instruction for the recommendation
 * @param userPrompt - User message (e.g. module context + research excerpt)
 * @returns Consensus result with normalized material value or alternatives
 */
export async function runMaterialConsensus(
  systemPrompt: string,
  userPrompt: string,
): Promise<ConsensusResult> {
  const alternatives: Array<{ model: string; output: string }> = []
  const results: string[] = []

  const runners: Array<{ name: string; fn: () => Promise<string> }> = [
    { name: "OpenAI", fn: () => callOpenAIConsensus(systemPrompt, userPrompt) },
    { name: "GPT-5.3", fn: () => callOpenAIConsensus(systemPrompt, userPrompt) },
  ]
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    runners.push({ name: "Gemini", fn: () => callGeminiConsensus(systemPrompt, userPrompt) })
  }

  await Promise.all(
    runners.map(async ({ name, fn }) => {
      try {
        const text = await fn()
        const normalized = normalizeMaterial(text)
        alternatives.push({ model: name, output: normalized })
        results.push(normalized)
      } catch (err) {
        console.warn(`[MultiModelConsensus] ${name} failed:`, err instanceof Error ? err.message : err)
      }
    }),
  )

  if (results.length === 0) {
    return { consensus: null, alternatives: [], agreed: false }
  }

  const counts = new Map<string, number>()
  for (const r of results) {
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted[0]
  const agreed = top[1] >= 2

  return {
    consensus: agreed ? top[0] : null,
    alternatives,
    agreed,
  }
}
