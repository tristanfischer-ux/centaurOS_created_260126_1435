/**
 * @file 1b-regulatory.ts — PA Stage 4: Regulatory Extraction
 *
 * Separate function for Regulatory Extraction, extracted from Research Synthesis.
 * Runs on PA_PIPELINE=true only, after runResearchSynthesis() lands.
 *
 * PA reference: prompt_architecture.pdf pages 9-10.
 * Prompt text is VERBATIM from the source document.
 *
 * Anti-invention rules enforced:
 *   - every entry's source_grade is hardcoded 'C'
 *   - every entry's verification_status is hardcoded 'UNVERIFIED'
 *   - applicability must explain WHY it applies to THIS specific product
 *   - engineering_impact must describe SPECIFIC design consequences
 *   - evidence_required must specify the exact document type
 *   - gap_action must be a concrete next step with a verb
 *   - NEVER claim a standard is met or complied with
 *   - REAL standard numbers and versions only
 *
 * Legacy path: regulatory is still extracted within Research (1-research.ts).
 */

import type { StructuredBriefJSON, RegulatoryExtraction, RegulatoryEntry, StageResult } from '../types'
import type { ProductClassification } from '../product-classifier'
import { REGULATORY_EXTRACTION_SYSTEM } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'

// ── OpenRouter call ──────────────────────────────────────────────────────────

async function callOpenRouter(systemPrompt: string, userContent: string): Promise<any> {
  // Prefer MiMo for regulatory (strong at structured compliance output).
  // Fallback to Gemini then Grok.
  const models = [
    'xiaomi/mimo-v2.5-pro',
    'google/gemini-3.1-pro-preview',
    'x-ai/grok-4.3',
  ]

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: STAGE_TEMPERATURES.research ?? 0.3,
          max_tokens: 8192,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`OpenRouter API returned status ${response.status}: ${text.slice(0, 200)}`)
      }

      const json = await response.json()
      const msg = json.choices?.[0]?.message
      let raw: string = msg?.content || ''
      // Handle reasoning models that split content/reasoning
      if (!raw && msg?.reasoning) raw = msg.reasoning
      if (!raw && msg?.reasoning_details?.length) {
        raw = msg.reasoning_details
          .filter((d: any) => d.type === 'reasoning.text')
          .map((d: any) => d.text)
          .join('\n')
      }

      if (!raw) throw new Error('No content in OpenRouter response')

      console.log(`[regulatory] ${model} responded: ${raw.length} chars`)

      // Robust JSON extraction
      let jsonStr = raw
      jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      jsonStr = jsonStr.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').trim()
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      try {
        return JSON.parse(jsonStr)
      } catch { /* fall through */ }

      const firstBrace = jsonStr.indexOf('{')
      const lastBrace = jsonStr.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
        } catch { /* fall through */ }
      }

      // Dump and fail
      try {
        const fs = await import('fs')
        const dumpPath = `/tmp/regulatory-raw-${model.replace(/\//g, '_')}-${Date.now()}.txt`
        fs.writeFileSync(dumpPath, raw)
        console.error(`[regulatory] ${model} JSON parse failed. Dumped to ${dumpPath}. First 500: ${raw.slice(0, 500)}`)
      } catch { /* ignore */ }
      throw new Error('Failed to parse JSON response from LLM')

    } catch (error) {
      clearTimeout(timeout)
      console.warn(`[regulatory] ${model} failed: ${(error as Error).message}. Trying next model...`)
      continue
    }
  }

  throw new Error('All models failed for regulatory extraction')
}

// ── Normalisation ────────────────────────────────────────────────────────────

const VALID_STATUS = new Set(['not_started', 'in_progress', 'complete'])
const VALID_CLAIM_TYPE = new Set(['requirement', 'recommendation', 'guidance'])

/**
 * Normalise and enforce anti-invention rules on a single regulatory entry.
 * - source_grade is ALWAYS 'C' regardless of what the LLM says.
 * - verification_status is ALWAYS 'UNVERIFIED' regardless of what the LLM says.
 * - status and claim_type are normalised to valid enum values.
 */
function normaliseEntry(raw: any): RegulatoryEntry {
  const status = VALID_STATUS.has(raw.status) ? raw.status : 'not_started'
  const claim_type = VALID_CLAIM_TYPE.has(raw.claim_type) ? raw.claim_type : 'requirement'

  return {
    standard_name: String(raw.standard_name || ''),
    version_date: String(raw.version_date || ''),
    jurisdiction: String(raw.jurisdiction || ''),
    owner: String(raw.owner || ''),
    status,
    claim_type,
    applicability: String(raw.applicability || ''),
    engineering_impact: String(raw.engineering_impact || ''),
    evidence_required: String(raw.evidence_required || ''),
    gap_action: String(raw.gap_action || ''),
    // Anti-invention rules: ALWAYS override whatever the LLM returns
    source_grade: 'C',
    verification_status: 'UNVERIFIED',
    verification_note: String(raw.verification_note || 'Requires compliance engineer review against actual design.'),
  }
}

function normaliseRegulatoryExtraction(raw: any): RegulatoryExtraction {
  const entries: RegulatoryEntry[] = Array.isArray(raw.regulatory_entries)
    ? raw.regulatory_entries.map(normaliseEntry)
    : []

  return { regulatory_entries: entries }
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Run Regulatory Extraction as a separate PA Stage 4 function.
 * Called on PA_PIPELINE=true after runResearchSynthesis() lands.
 *
 * @param parsedBrief   StructuredBriefJSON from Stage 1
 * @param classification  Classification object from Product Classification stage
 */
export async function runRegulatoryExtraction(
  parsedBrief: StructuredBriefJSON,
  classification: ProductClassification | string,
): Promise<StageResult<RegulatoryExtraction>> {
  const startTime = Date.now()
  console.log('[regulatory] Starting PA Stage 4: Regulatory Extraction...')

  const classificationStr =
    typeof classification === 'string'
      ? classification
      : (classification as ProductClassification).productClass

  const userContent =
    `[Structured brief JSON from Stage 1]\n${JSON.stringify(parsedBrief, null, 2)}\n\n` +
    `[Product classification from Stage 2]\n${classificationStr}`

  try {
    const rawJson = await callOpenRouter(REGULATORY_EXTRACTION_SYSTEM, userContent)
    const extraction = normaliseRegulatoryExtraction(rawJson)

    console.log(
      `[regulatory] PA Stage 4 complete: ${extraction.regulatory_entries.length} entries extracted. ` +
      `All entries: source_grade=C, verification_status=UNVERIFIED.`
    )

    return {
      ok: true,
      data: extraction,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[regulatory] PA Stage 4 failed:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during regulatory extraction',
      durationMs: Date.now() - startTime,
    }
  }
}
