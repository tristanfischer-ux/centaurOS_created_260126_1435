/**
 * 0-brief-generation.ts — Brief Generation Stage
 *
 * Contains TWO functions:
 *
 *   runBriefParsing()  — PA Stage 1 (new). Called first in the pipeline when
 *                        PA_PIPELINE=true. Outputs StructuredBriefJSON.
 *
 *   runBriefGeneration() — Legacy 5-section brief (default path, PA_PIPELINE=false).
 *                          DO NOT DELETE until Phase H cleanup.
 *
 * Pipeline position (PA path):   runBriefParsing → Classification → Research → …
 * Pipeline position (legacy path): Classification → Training Data → Research → runBriefGeneration → …
 */

import type { StageResult, StructuredBriefJSON } from '../types'

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

const BRIEF_SYSTEM_PROMPT = `You are writing the Brief section of an engineering report. You MUST follow this exact structure with these exact headings:

# Project Brief: [One-line project name + purpose]

## 1. Project Purpose
[1 sentence. State the primary engineering goal in measurable terms. Include a quantifiable outcome.]

## 2. Core Objectives
- [3-5 bullets. Each must be testable/verifiable and tied to a metric.]

## 3. Key Requirements & Constraints
### Requirements
- [Manufacturing process, materials, tolerances, compliance standards]
### Constraints
- [Mass, cost ceiling, production volume, jurisdiction, envelope dimensions, operating temperature]

## 4. Scope Boundaries
**In scope:** [What this report covers]
**Out of scope:** [What is explicitly excluded — at least 2 items]

## 5. Success Criteria
- [2-3 bullets. Each must be numeric and independent of design choices.]

RULES:
- Total length: 180-280 words main body
- Every metric must include units
- No vague language ("appropriate", "suitable", "reasonable")
- No placeholders or TBD
- Cost ceiling MUST be a specific number with currency
- Mass MUST be a specific number with units
- Production volume MUST be a specific number with frequency
- If a field is unknown, write "Not specified — requires [specific input]"

Also extract structured data as JSON at the end:
\`\`\`json
{
  "projectName": "...",
  "purpose": "...",
  "objectives": ["..."],
  "requirements": ["..."],
  "constraints": ["..."],
  "inScope": "...",
  "outOfScope": ["..."],
  "successCriteria": ["..."],
  "costCeiling": null,
  "maxMass": null,
  "productionVolume": null,
  "jurisdiction": null,
  "envelope": null,
  "operatingTemp": null,
  "standards": ["..."]
}
\`\`\``

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
 * Generate a structured Brief from raw founder text.
 * This is the first pipeline stage — everything downstream depends on it.
 */
export async function runBriefGeneration(
  rawBriefText: string,
  productClass: string,
): Promise<StageResult<GeneratedBrief>> {
  const startTime = Date.now()
  console.log('[brief-gen] Generating structured Brief...')
  console.log(`[brief-gen] Input: ${rawBriefText.length} chars, product class: ${productClass}`)

  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-pro-preview',
        max_tokens: 16384,
        temperature: 0.3,
        messages: [
          { role: 'system', content: BRIEF_SYSTEM_PROMPT },
          { role: 'user', content: `FOUNDER BRIEF:\n${rawBriefText}\n\nPRODUCT CLASS: ${productClass}` },
        ],
      }),
    }, 180000)

    if (!response.ok) {
      throw new Error(`OpenRouter API ${response.status}`)
    }

    const json = await response.json()
    const raw = json.choices?.[0]?.message?.content || ''
    
    if (!raw) {
      throw new Error('Empty response from LLM')
    }

    // Extract the brief text (everything before the JSON block)
    const briefText = raw.replace(/```json[\s\S]*?```/, '').trim()

    // Extract the structured JSON from the end of the response
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/)
    let fields: GeneratedBrief['fields'] = {
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

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        fields = { ...fields, ...parsed }
      } catch (e) {
        console.warn('[brief-gen] Failed to parse structured JSON, extracting from text')
        extractFieldsFromText(briefText, fields)
      }
    } else {
      // No JSON block found — extract fields from the brief text
      console.warn('[brief-gen] No JSON block found, extracting from text')
      extractFieldsFromText(briefText, fields)
    }

    console.log(`[brief-gen] Generated: ${briefText.length} chars, ${fields.objectives.length} objectives, ${fields.constraints.length} constraints`)

    return {
      ok: true,
      data: { briefText, fields },
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
// System prompt copied verbatim from prompt_architecture.pdf pages 4-5.
// DO NOT paraphrase. The anti-invention rules in this prompt are load-bearing.

const BRIEF_PARSING_SYSTEM_PROMPT = `You are a hardware product brief parser. Your job is to extract structured engineering constraints from a natural-language product description. You must extract every constraint the user states, infer reasonable defaults for unstated fields where possible, and clearly mark which fields are user-stated vs inferred.

Output ONLY valid JSON. No preamble, no markdown fences.

Required output schema:
{
  "project_id": string,
  "product_description": string (1-2 sentences),
  "mission_statement": string,
  "target_customers": string,
  "why_now": string,
  "constraints": {
    "unit_cost_ceiling": { "value": number|null, "currency": "GBP"|"USD"|"EUR", "source": "user"|"inferred" },
    "max_mass_kg": { "value": number|null, "source": "user"|"inferred" },
    "max_dimensions_mm": { "w": number|null, "d": number|null, "h": number|null, "source": "user"|"inferred" },
    "target_performance": { "key_metric": string|null, "value": number|null, "unit": string|null, "source": "user"|"inferred" },
    "target_process": { "value": string|null, "source": "user"|"inferred" },
    "target_material": { "value": string|null, "source": "user"|"inferred" },
    "batch_size": { "value": number|null, "source": "user"|"inferred" },
    "design_life": { "value": string|null, "source": "user"|"inferred" },
    "operating_environment": { "temp_min_c": number|null, "temp_max_c": number|null, "source": "user"|"inferred" },
    "safety_standards": [{ "standard": string, "source": "user"|"inferred" }],
    "additional_constraints": [{ "description": string, "source": "user"|"inferred" }]
  },
  "missing_mandatory_fields": [string],  // Fields the user did not state AND you cannot infer
  "confidence": "HIGH"|"MEDIUM"|"LOW"
}

Rules:
- If the user states a constraint explicitly, source = "user".
- If you infer a constraint from context (e.g. ISO container dimensions from "40ft container"), source = "inferred".
- If a field is genuinely unknown and cannot be reasonably inferred, set value to null and add to missing_mandatory_fields.
- NEVER invent performance numbers. If the user says "efficient" but doesn't give a COP or efficiency target, the value is null. Example: { "key_metric": "efficiency", "value": null, "unit": "COP", "source": "inferred" }
- Dimensions: always in mm. Mass: always in kg. Cost: preserve the user's stated currency.
- operating_environment temps may be null if the user gives no operating range; do not invent a range.`

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
  console.log('[brief-parse] PA Stage 1: parsing brief...')
  console.log(`[brief-parse] Input: ${rawBriefText.length} chars`)

  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-pro-preview',
        max_tokens: 4096,
        temperature: 0.1,
        messages: [
          { role: 'system', content: BRIEF_PARSING_SYSTEM_PROMPT },
          { role: 'user', content: rawBriefText },
        ],
      }),
    }, 120000)

    if (!response.ok) {
      throw new Error(`OpenRouter API ${response.status}: ${await response.text()}`)
    }

    const json = await response.json()
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

    return {
      ok: true,
      data: parsed,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[brief-parse] Failed: ${message}`)
    return {
      ok: false,
      error: message,
      durationMs: Date.now() - startTime,
    }
  }
}
