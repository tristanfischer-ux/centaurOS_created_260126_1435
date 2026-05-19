/**
 * 0-brief-generation.ts — Brief Generation Stage
 *
 * Contains TWO functions:
 *
 *   runBriefParsing()  — PA Stage 1 (active). Called first in the pipeline when
 *                        PA_PIPELINE=true. Outputs StructuredBriefJSON.
 *
 *   runBriefGeneration() — Legacy entry point on PA_PIPELINE=false.
 *                          WS-E 2026-05-13: this is now a thin delegating
 *                          wrapper around Stage 0.5 (runBriefExpansion). No
 *                          separate LLM call. Kept for backwards-compat with
 *                          the legacy orchestrator path and the RL harnesses
 *                          (feasibility-rl-iterate, decompose-rl-iterate,
 *                          stage-rl-iterate, feasibility-full-rl).
 *
 * Pipeline position (PA path):   runBriefParsing → Classification → Research → …
 * Pipeline position (legacy path): Classification → Training Data → Research → runBriefGeneration → …
 */

import type { StageResult, StructuredBriefJSON } from '../types'
import { getActionLogger } from '../lib/action-logger'

export interface GeneratedBrief {
  /** The structured 5-section Brief text (rendered in PDF) */
  briefText: string
  /** Extracted structured fields for downstream stages */
  fields: {
    projectName: string
    purpose: string
    objectives: string[]
    requirements: string[]
    constraints: string[]
    inScope: string
    outOfScope: string[]
    successCriteria: string[]
    costCeiling: number | null
    maxMass: number | null
    productionVolume: string | null
    jurisdiction: string | null
    envelope: string | null
    operatingTemp: string | null
    standards: string[]
  }
}

// WS-E 2026-05-13: BRIEF_SYSTEM_PROMPT removed — runBriefGeneration no longer
// makes its own LLM call to re-write the founder text into a 5-section
// template. It now delegates to Stage 0.5 (runBriefExpansion). The PA path
// (runBriefParsing below) has its own prompt imported from ../prompts.ts.

/**
 * Extract structured fields from brief text when JSON extraction fails.
 * Parses the 5-section template to find objectives, constraints, etc.
 */
function extractFieldsFromText(text: string, fields: any): void {
  // Extract project name and purpose
  const titleMatch = text.match(/# Project Brief:\s*(.+)/i)
  if (titleMatch) {
    const parts = titleMatch[1].split('+').map(s => s.trim())
    if (parts.length > 0) fields.projectName = parts[0]
    if (parts.length > 1) fields.purpose = parts.slice(1).join(' + ')
  }

  const purposeMatch = text.match(/## 1\. Project Purpose\s*([\s\S]*?)(?=\n## |\n*$)/)
  if (purposeMatch && !fields.purpose) {
    fields.purpose = purposeMatch[1].trim()
  }

  // Extract scope
  const scopeMatch = text.match(/## 4\. Scope Boundaries\s*([\s\S]*?)(?=\n## |\n*$)/)
  if (scopeMatch) {
    const inMatch = scopeMatch[1].match(/\*\*In scope:\*\*\s*(.+)/i)
    if (inMatch) fields.inScope = inMatch[1].trim()
    const outMatch = scopeMatch[1].match(/\*\*Out of scope:\*\*\s*(.+)/i)
    if (outMatch) {
      fields.outOfScope = outMatch[1].split(/,|\band\b/).map(s => s.trim()).filter(Boolean)
    }
  }

  // Extract success criteria
  const successMatch = text.match(/## 5\. Success Criteria\s*([\s\S]*?)(?=\n## |\n*$)/)
  if (successMatch) {
    const bullets = successMatch[1].match(/^-\s+(.+)$/gm)
    if (bullets) fields.successCriteria = bullets.map(b => b.replace(/^-\s+/, '').trim())
  }

  // Extract new constraints
  const jurisdictionMatch = text.match(/[Jj]urisdiction.*?(UK|EU|US|Europe|United States|Global|International|[A-Z][a-z]+)/)
  if (jurisdictionMatch) fields.jurisdiction = jurisdictionMatch[1].trim()
  
  const envelopeMatch = text.match(/[Ee]nvelope.*?(?:dimensions|size)?[:\s]+([\d.,\s]+(?:x|\*)[\d.,\s]+(?:x|\*)[\d.,\s]+(?:m|cm|mm))/i)
  if (envelopeMatch) fields.envelope = envelopeMatch[1].trim()
  
  const tempMatch = text.match(/[Oo]perating\s*[Tt]emp(?:erature)?[:\s]+(-?\d+\s*(?:to|-)\s*-?\d+\s*(?:°C|C|°F|F))/i)
  if (tempMatch) fields.operatingTemp = tempMatch[1].trim()

  const standardsMatch = text.match(/[Ss]tandards[:\s]+((?:(?:ISO|IEC|EN|BS|UL|CE)\s*\d+[, \n]*)+)/i)
  if (standardsMatch) fields.standards = standardsMatch[1].split(',').map(s => s.trim()).filter(Boolean)

  // Extract objectives from "## 2. Core Objectives" section
  const objMatch = text.match(/## 2\. Core Objectives\s*([\s\S]*?)(?=\n## |\n*$)/)
  if (objMatch) {
    const bullets = objMatch[1].match(/^-\s+(.+)$/gm)
    if (bullets) {
      fields.objectives = bullets.map(b => b.replace(/^-\s+/, '').trim())
    }
  }
  
  // Extract constraints from "### Constraints" section
  const consMatch = text.match(/### Constraints\s*([\s\S]*?)(?=\n## |\n### |\n*$)/)
  if (consMatch) {
    const bullets = consMatch[1].match(/^-\s+(.+)$/gm)
    if (bullets) {
      fields.constraints = bullets.map(b => b.replace(/^-\s+/, '').trim())
    }
  }
  
  // Extract requirements from "### Requirements" section
  const reqMatch = text.match(/### Requirements\s*([\s\S]*?)(?=\n### |\n## |\n*$)/)
  if (reqMatch) {
    const bullets = reqMatch[1].match(/^-\s+(.+)$/gm)
    if (bullets) {
      fields.requirements = bullets.map(b => b.replace(/^-\s+/, '').trim())
    }
  }
  
  // Extract cost ceiling from constraints text
  const costMatch = text.match(/[Cc]ost.*?(?:£|\$|€)\s*([\d,]+)/)
  if (costMatch) fields.costCeiling = parseInt(costMatch[1].replace(/,/g, ''))
  
  // Extract mass from constraints text
  const massMatch = text.match(/[Mm]ass.*?([\d,.]+)\s*kg/)
  if (massMatch) fields.maxMass = parseFloat(massMatch[1].replace(/,/g, ''))
  
  // Extract production volume
  const volMatch = text.match(/([\d,]+)\s*(?:units?|pcs?)\s*(?:per|\/)\s*year/i)
  if (volMatch) fields.productionVolume = volMatch[0]
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Generate a structured Brief from raw founder text — legacy path (PA_PIPELINE=false).
 * This is the first pipeline stage on the legacy path.
 *
 * @deprecated Use `runBriefParsing()` on the PA path (PA_PIPELINE=true / default).
 * This function is preserved for the legacy rollback path only (PA_PIPELINE=false).
 *
 * WS-E 2026-05-13: merged into Stage 0.5 (brief-expansion). The previous
 * implementation made its own LLM call to re-write the founder's text into a
 * 5-section template — vestigial since there's always SOME brief and the PA
 * path uses `runBriefParsing()` instead. New implementation:
 *   1. Uses `extractFieldsFromText` on the raw founder text to pick up
 *      whatever structured constraints are already present (cost, mass, volume,
 *      jurisdiction, envelope, temperature, standards, objectives, etc.).
 *   2. Calls `runBriefExpansion` (Stage 0.5) to infer any missing fields.
 *   3. Returns the founder's text as `briefText` (no LLM re-write) plus the
 *      merged structured fields.
 * Callers that consumed the old 5-section re-write (RL harnesses, the legacy
 * orchestrator path) now get the founder's brief verbatim plus extracted +
 * inferred constraint fields.
 */
export async function runBriefGeneration(
  rawBriefText: string,
  productClass: string,
): Promise<StageResult<GeneratedBrief>> {
  const startTime = Date.now()
  console.log('[brief-gen] WS-E: delegating to Stage 0.5 (brief-expansion)...')
  console.log(`[brief-gen] Input: ${rawBriefText.length} chars, product class: ${productClass}`)

  try {
    const fields: GeneratedBrief['fields'] = {
      projectName: '',
      purpose: '',
      objectives: [],
      requirements: [],
      constraints: [],
      inScope: '',
      outOfScope: [],
      successCriteria: [],
      costCeiling: null,
      maxMass: null,
      productionVolume: null,
      jurisdiction: null,
      envelope: null,
      operatingTemp: null,
      standards: [],
    }

    // Step 1: deterministic extraction from the founder's raw text.
    // Most concrete facts (cost, mass, jurisdiction, etc.) are already there —
    // no LLM needed.
    extractFieldsFromText(rawBriefText, fields)

    // Step 2: delegate to Stage 0.5 to infer missing fields.
    // Dynamic import to avoid a static cycle (run-brief-only.ts imports both
    // sides) and to keep this function callable from RL drivers that import
    // the file with no Stage 0.5 dependency loaded yet.
    const { runBriefExpansion } = await import('./0.5-brief-expansion')
    const expansionResult = await runBriefExpansion(rawBriefText, productClass, {
      confidence: 'LOW',
      technologyDomains: [],
    })

    if (expansionResult.ok && expansionResult.data) {
      const exp = expansionResult.data
      // Map Stage 0.5 inferred fields onto the GeneratedBrief.fields shape.
      // expandedFields uses snake_case keys (target_cost, target_mass, etc.);
      // map only when the deterministic extraction did not already fill the
      // slot. This preserves "founder text wins; Stage 0.5 fills the gaps".
      const ef = exp.expandedFields as Record<string, unknown>
      if (fields.costCeiling == null) {
        const v = ef.target_cost ?? ef.cost_ceiling ?? ef.unit_cost
        if (typeof v === 'number') fields.costCeiling = v
      }
      if (fields.maxMass == null) {
        const v = ef.max_mass ?? ef.target_mass ?? ef.mass_kg
        if (typeof v === 'number') fields.maxMass = v
      }
      if (!fields.productionVolume) {
        const v = ef.production_volume ?? ef.target_volume ?? ef.quantity_target
        if (typeof v === 'string' || typeof v === 'number') fields.productionVolume = String(v)
      }
      if (!fields.jurisdiction) {
        const v = ef.jurisdiction ?? ef.target_market
        if (typeof v === 'string') fields.jurisdiction = v
      }
      if (!fields.envelope) {
        const v = ef.envelope ?? ef.dimensions
        if (typeof v === 'string') fields.envelope = v
      }
      if (!fields.operatingTemp) {
        const v = ef.operating_temp ?? ef.operating_temperature
        if (typeof v === 'string') fields.operatingTemp = v
      }
    } else {
      console.warn(`[brief-gen] Stage 0.5 expansion failed (${expansionResult.error ?? 'unknown'}); proceeding with deterministic extraction only`)
    }

    // briefText is the founder's raw text — no re-write. Downstream stages
    // (renderer, BoM, etc.) read the structured `fields` for facts and the
    // `briefText` for prose, so handing back the founder's original prose is
    // the most faithful representation.
    console.log(`[brief-gen] Built: ${rawBriefText.length} chars briefText, ${fields.objectives.length} objectives, ${fields.constraints.length} constraints`)

    return {
      ok: true,
      data: { briefText: rawBriefText, fields },
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[brief-gen] Failed: ${message}`)
    return {
      ok: false,
      error: message,
      durationMs: Date.now() - startTime,
    }
  }
}

// ── PA Stage 1: Brief Parsing ─────────────────────────────────────────────────
//
// Single source of truth: BRIEF_PARSING_SYSTEM in ../prompts.ts
// Do NOT duplicate the prompt here — import it.
import { BRIEF_PARSING_SYSTEM as BRIEF_PARSING_SYSTEM_PROMPT } from '../prompts'

/**
 * PA Stage 1 — Brief Parsing.
 *
 * Converts raw founder text into a StructuredBriefJSON object.
 * Called first in the pipeline when PA_PIPELINE=true.
 * Existing runBriefGeneration() is the fallback on PA_PIPELINE=false.
 */
export async function runBriefParsing(
  rawBriefText: string,
): Promise<StageResult<StructuredBriefJSON>> {
  const startTime = Date.now()
  const logger = getActionLogger()
  logger.logStage({ step_name: 'brief_parsing', action_type: 'stage_start', brief_chars: rawBriefText.length })
  console.log('[brief-parse] PA Stage 1: parsing brief...')
  console.log(`[brief-parse] Input: ${rawBriefText.length} chars`)

  const MODEL = 'google/gemini-3.1-pro-preview'
  const t0 = Date.now()
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        // WS-D 2026-05-13: 150k (was 16384) — Tristan approved; truncation more expensive than unused tokens.
        max_tokens: 150_000,
        temperature: 0.1,
        messages: [
          { role: 'system', content: BRIEF_PARSING_SYSTEM_PROMPT },
          { role: 'user', content: rawBriefText },
        ],
      }),
    }, 120000)

    if (!response.ok) {
      logger.logLlm({ step_name: 'brief_parsing', model: MODEL, latency_ms: Date.now() - t0, ok: false, error: `OpenRouter ${response.status}` })
      throw new Error(`OpenRouter API ${response.status}: ${await response.text()}`)
    }

    const json = await response.json()
    logger.logLlm({
      step_name: 'brief_parsing',
      model: MODEL,
      prompt_tokens: json?.usage?.prompt_tokens,
      completion_tokens: json?.usage?.completion_tokens,
      latency_ms: Date.now() - t0,
      finish_reason: json?.choices?.[0]?.finish_reason,
      ok: true,
    })
    const raw = json.choices?.[0]?.message?.content || ''

    if (!raw) {
      throw new Error('Empty response from LLM')
    }

    // Strip markdown fences if model ignores the instruction
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    let parsed: StructuredBriefJSON
    try {
      parsed = JSON.parse(cleaned)
    } catch (parseErr) {
      throw new Error(`Failed to parse LLM JSON: ${(parseErr as Error).message}. Raw output (first 500 chars): ${cleaned.slice(0, 500)}`)
    }

    // Normalise missing_mandatory_fields to array
    if (!Array.isArray(parsed.missing_mandatory_fields)) {
      parsed.missing_mandatory_fields = []
    }

    // BLOCKER-2 fix: initialise constraints object BEFORE any field-level
    // normalisation. If the LLM omits the entire constraints block the optional
    // chaining in the guards below is safely true, but the subsequent assignment
    // (parsed.constraints.safety_standards = []) would throw TypeError on undefined.
    if (!parsed.constraints) {
      parsed.constraints = {
        unit_cost_ceiling: { value: null, currency: 'GBP', source: 'inferred' },
        max_mass_kg: { value: null, source: 'inferred' },
        max_dimensions_mm: { w: null, d: null, h: null, source: 'inferred' },
        target_performance: { key_metric: null, value: null, unit: null, source: 'inferred' },
        target_process: { value: null, source: 'inferred' },
        target_material: { value: null, source: 'inferred' },
        batch_size: { value: null, source: 'inferred' },
        design_life: { value: null, source: 'inferred' },
        operating_environment: { temp_min_c: null, temp_max_c: null, source: 'inferred' },
        safety_standards: [],
        additional_constraints: [],
      } as any
    }

    // Normalise safety_standards and additional_constraints to arrays
    if (!Array.isArray(parsed.constraints?.safety_standards)) {
      parsed.constraints.safety_standards = []
    }
    if (!Array.isArray(parsed.constraints?.additional_constraints)) {
      parsed.constraints.additional_constraints = []
    }

    console.log(`[brief-parse] OK — confidence=${parsed.confidence}, missing=${parsed.missing_mandatory_fields.length} fields`)

    logger.logStage({
      step_name: 'brief_parsing',
      action_type: 'stage_end',
      outcome: 'ok',
      duration_ms: Date.now() - startTime,
      confidence: parsed.confidence,
      missing_count: parsed.missing_mandatory_fields.length,
    })
    return {
      ok: true,
      data: parsed,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[brief-parse] Failed: ${message}`)
    logger.logStage({
      step_name: 'brief_parsing',
      action_type: 'stage_end',
      outcome: 'fail',
      duration_ms: Date.now() - startTime,
      error: message,
    })
    return {
      ok: false,
      error: message,
      durationMs: Date.now() - startTime,
    }
  }
}
