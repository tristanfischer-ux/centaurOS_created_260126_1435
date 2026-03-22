/**
 * @file multi-model-consensus.ts
 *
 * @description Multi-model consensus for high-stakes engineering recommendations.
 * Runs the same prompt through Claude, GPT-4o, and optionally Gemini; returns
 * consensus value or flags disagreement with alternatives.
 *
 * @related src/actions/cad-lab.ts (prefillDiagnostics)
 */

import { withRetry } from '@/lib/retry'

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

// INTENT: Retry on transient API errors (rate limit, server errors, network issues)
const apiShouldRetry = (error: Error) => {
  const msg = error.message.toLowerCase()
  return msg.includes('429') || msg.includes('502') || msg.includes('503') ||
    msg.includes('network') || msg.includes('timeout') || msg.includes('529')
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured")
  return withRetry(async () => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Claude error: ${response.status}`)
    const data = await response.json()
    return (data.content?.[0]?.text ?? "").trim()
  }, { maxRetries: 2, baseDelay: 2000, shouldRetry: apiShouldRetry })
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")
  const OpenAI = (await import("openai")).default
  const openai = new OpenAI({ apiKey })
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 256,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }, { signal: AbortSignal.timeout(30_000) })
  return (completion.choices?.[0]?.message?.content ?? "").trim()
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY?.trim() ?? process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error("Gemini API key not configured")
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`
  return withRetry(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`)
    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    return text.trim()
  }, { maxRetries: 2, baseDelay: 2000, shouldRetry: apiShouldRetry })
}

/**
 * Runs a material-recommendation prompt through Claude and GPT-4o (and Gemini if configured).
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
    { name: "Claude", fn: () => callClaude(systemPrompt, userPrompt) },
    { name: "GPT-4o", fn: () => callOpenAI(systemPrompt, userPrompt) },
  ]
  if (process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()) {
    runners.push({ name: "Gemini", fn: () => callGemini(systemPrompt, userPrompt) })
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
