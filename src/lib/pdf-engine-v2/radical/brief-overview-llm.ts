// src/lib/pdf-engine-v2/radical/brief-overview-llm.ts
//
// Piece 1G (2026-05-12) — LLM-augmented brief overview prose generation.
// Takes a StructuredBriefJSON + optional ResearchSynthesis, returns four
// prose blocks for the "Brief and Requirements" PDF section:
//   1. overview_and_context  — 2 paragraphs: what + why this approach
//   2. mission_statement     — 1-2 sentences, specific outcome
//   3. target_customers      — 1 paragraph, Primary / Secondary segmentation
//   4. why_now               — 1 paragraph, market-context data + named entities
//
// Same fetch/parse/fallback pattern as Piece 1F (module-paragraph-llm.ts).
// Model: x-ai/grok-4.3. Temperature 0.3 (structured JSON output with prose blocks).
// Max tokens: 2048 (four prose blocks; 400-600 words total; leaves headroom).
// Cost: ~£0.08 per call. One call per pipeline run.

import type { StructuredBriefJSON, ResearchSynthesis } from '../types'

export interface BriefOverviewProse {
  overview_and_context: string   // 2 paragraphs separated by \n\n
  mission_statement: string      // 1-2 sentences
  target_customers: string       // 1 paragraph with Primary/Secondary segmentation
  why_now: string                // 1 paragraph with market-context data + named entities
  generated_at: string
  model_used: string
  used_research_synthesis: boolean
}

const SYSTEM_PROMPT = `You are a senior engineering writer drafting the "Brief and Requirements" section of a hardware engineering report for a hardware investor or technical co-founder audience. Translate a structured brief + market research synthesis into FOUR distinct prose blocks. Output ONLY a single JSON object — no preamble, no markdown fences, no commentary. First character must be opening brace.

Required JSON shape:
{
  "overview_and_context": "<two paragraphs>",
  "mission_statement": "<1-2 sentences>",
  "target_customers": "<one paragraph with Primary: ... Secondary: ... segmentation>",
  "why_now": "<one paragraph with market-context numbers + named entities>"
}

Style requirements:
1. SPECIFIC numbers + dates + named entities ONLY when present in the input brief or research synthesis. If a market figure (e.g. "£2.5 billion in FY2024/25") is NOT in the inputs, write in QUALIFIED terms ("UK grid balancing costs have risen substantially in recent years driven by intermittent renewables") rather than fabricating a precise number. Hallucinated figures are worse than qualified statements in an investment-grade engineering memo.
2. Engineering investment memo tone. Not marketing. Not academic. Direct sentences, no hedging unless data is genuinely uncertain.
3. British spelling: "organised", "containerised", "behaviour", "colour", "characterise".
4. Overview and Context = TWO paragraphs separated by \\n\\n inside the JSON string. First paragraph: WHAT the product is + functional spec. Second paragraph: WHY this approach is correct given constraints.
5. Mission Statement: ONE sentence (or two short ones). State the outcome the product must deliver, in specific terms (target unit cost, target deployment time, target payback period). Use the brief's actual constraint values, not invented ones.
6. Target Customers: Primary segment + Secondary segment. Each named with the buying decision unit (developer / asset owner / OEM / system integrator / etc.). Use the brief's target market language, not fabricated segments.
7. Why Now: market-context paragraph. When research synthesis is available, cite its specific data points + named sources verbatim. When it is NOT, write a qualitative market-context paragraph using GENERAL industry trends (regulatory direction, technology cost curves, market structure) without inventing specific numbers.
8. CRITICAL: match the STRUCTURE of the few-shot example below, NOT its domain vocabulary. The example is a UK-grid BESS; you may receive a US-market CGM patch, a marine AUV, a global satellite ground station. Do NOT import "UK grid balancing", "National Grid ESO", or "frequency response" into a non-energy product. Use the vocabulary from the INPUT brief's product class + market. The example shows you the SHAPE (what-and-why → mission → primary/secondary segments → market trend); fill that shape with the input's actual content.

Bad output:
- "This product addresses an important market opportunity."
- "Customers will benefit from improved performance."
- "The mission is to provide a quality product to customers."

Good output:
- "UK grid balancing costs exceeded £2.5 billion in FY2024/25, driven by intermittent renewable generation now exceeding 50% of supply."
- "Primary: UK energy storage developers and asset owners participating in National Grid ESO frequency response and capacity market tenders."
- "To deliver a factory-assembled, grid-ready BESS container that can be deployed on any UK site with a suitable grid connection within five working days of delivery, at a unit cost that enables a seven-year simple payback from frequency response revenues alone."`

const FEW_SHOT_BESS_OUTPUT = JSON.stringify({
  overview_and_context: "A containerised battery energy storage system housed in a standard 40 ft ISO shipping container, providing approximately 3.5 MWh of usable energy capacity via lithium iron phosphate (LFP) prismatic cells. The system connects to the UK distribution or transmission network through a 1 MW power conversion system (PCS) and is intended for grid-side frequency response, peak shaving, and capacity market participation, or for behind-the-meter demand management at commercial and industrial (C&I) sites.\n\nThe containerised approach — using a self-contained, factory-assembled unit that arrives on site requiring only grid connection, communications, and foundation — is deliberate. It eliminates site-specific electrical engineering, reduces installation from weeks to days, and allows the manufacturer to control quality, safety testing, and thermal management in a factory environment rather than on a construction site.",
  mission_statement: "To deliver a factory-assembled, grid-ready BESS container that can be deployed on any UK site with a suitable grid connection within five working days of delivery, at a unit cost that enables a seven-year simple payback from frequency response revenues alone.",
  target_customers: "Primary: UK energy storage developers and asset owners participating in National Grid ESO frequency response and capacity market tenders. Secondary: large C&I electricity consumers (data centres, manufacturing sites, EV charging hubs) seeking demand charge reduction and backup power.",
  why_now: "UK grid balancing costs exceeded £2.5 billion in FY2024/25, driven by intermittent renewable generation now exceeding 50% of supply. National Grid ESO has tripled procurement of dynamic containment and dynamic regulation services since 2022. LFP cell prices have fallen below $60/kWh at pack level, making containerised storage economically viable at scales previously reserved for pumped hydro. The Capacity Market continues to award 15-year contracts to battery storage, providing revenue certainty that underpins project finance.",
})

/**
 * Generate LLM-augmented prose for the four "Brief and Requirements" sub-sections.
 * Throws on transport/parse failure. Caller wraps in try/catch and falls back
 * to the tabular brief data when this throws.
 */
export async function generateBriefOverviewProse(
  parsedBrief: StructuredBriefJSON,
  researchSynthesis: ResearchSynthesis | undefined,
): Promise<BriefOverviewProse> {
  const userContent = [
    '=== FEW-SHOT EXAMPLE ===',
    'INPUT: 3.5 MWh containerised BESS for UK grid',
    'OUTPUT:',
    FEW_SHOT_BESS_OUTPUT,
    '',
    '=== YOUR TASK ===',
    'INPUT BRIEF:',
    JSON.stringify(parsedBrief, null, 2).slice(0, 8000),
    '',
    'INPUT RESEARCH SYNTHESIS (market sources, competitor data, claims):',
    researchSynthesis
      ? JSON.stringify(researchSynthesis, null, 2).slice(0, 4000)
      : '(no research synthesis available — generate from brief alone, do NOT invent specific market figures)',
    '',
    'OUTPUT YOUR JSON OBJECT (four prose blocks, engineering investment memo tone, British spelling, named entities + specific numbers):',
  ].join('\n')

  // Council 2026-05-12 fix: 45s timeout + finish_reason check.
  // AbortController + setTimeout (not AbortSignal.timeout — Vercel gotcha
  // per MEMORY.md: "AbortSignal.timeout() unreliable in server actions").
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'x-ai/grok-4.3',
        temperature: 0.3,
        // WS-D 2026-05-13: 150k (was 2048) — Tristan approved; truncation more expensive than unused tokens.
        max_tokens: 150_000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`OpenRouter status ${response.status}`)
  }
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  // Council 2026-05-12 fix: finish_reason check — 'length' means max_tokens
  // truncation, which would produce a truncated JSON object that throws on
  // parse with no diagnostic. Surface explicitly.
  const choice = json.choices?.[0]
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    throw new Error(`LLM finish_reason='${choice.finish_reason}' (likely max_tokens truncation)`)
  }
  const raw = choice?.message?.content?.trim() ?? ''

  // Tolerate code fences and preamble — same pattern as Stage 1.5 JSON parsing.
  let cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  const parsed = JSON.parse(cleaned) as Partial<BriefOverviewProse>
  if (
    !parsed.overview_and_context ||
    !parsed.mission_statement ||
    !parsed.target_customers ||
    !parsed.why_now
  ) {
    throw new Error(
      `Brief overview prose response missing required fields: ${Object.keys(parsed).join(', ')}`,
    )
  }

  return {
    overview_and_context: parsed.overview_and_context,
    mission_statement: parsed.mission_statement,
    target_customers: parsed.target_customers,
    why_now: parsed.why_now,
    generated_at: new Date().toISOString(),
    model_used: 'x-ai/grok-4.3',
    used_research_synthesis: !!researchSynthesis,
  }
}
