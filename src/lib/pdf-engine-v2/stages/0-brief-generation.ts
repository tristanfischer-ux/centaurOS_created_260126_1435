/**
 * 0-brief-generation.ts — Brief Generation Stage
 * 
 * This is the FIRST pipeline stage after classification. It takes the raw
 * founder text and produces a structured 5-section Brief that scores 9-10/10
 * on council judging. All downstream stages (Research, Feasibility, BOM, etc.)
 * use this structured Brief as their input, not the raw founder text.
 * 
 * Pipeline position: Classification → Brief Generation → Training Data → Research → ...
 */

import type { StageResult } from '../types'

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
  const costMatch = text.match(/[Cc]ost.*?£([\d,]+)/)
  if (costMatch) fields.costCeiling = parseInt(costMatch[1].replace(/,/g, ''))
  
  // Extract mass from constraints text
  const massMatch = text.match(/[Mm]ass.*?([\d,.]+)\s*kg/)
  if (massMatch) fields.maxMass = parseFloat(massMatch[1].replace(/,/g, ''))
  
  // Extract production volume
  const volMatch = text.match(/([\d,]+)\s*(?:units?|pcs?)\s*(?:per|\/)\s*year/i)
  if (volMatch) fields.productionVolume = volMatch[0]
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
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      signal: AbortSignal.timeout(180000),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API ${response.status}`)
    }

    const json = await response.json()
    const raw = json.choices?.[0]?.message?.content || ''
    
    if (!raw) {
      throw new Error('Empty response from LLM')
    }

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
        extractFieldsFromText(raw, fields)
      }
    } else {
      // No JSON block found — extract fields from the brief text
      console.warn('[brief-gen] No JSON block found, extracting from text')
      extractFieldsFromText(raw, fields)
    }

    // Extract the brief text (everything before the JSON block)
    const briefText = raw.replace(/```json[\s\S]*?```/, '').trim()

    // Extract numeric constraints from the brief text if not in JSON
    if (fields.costCeiling === null) {
      const costMatch = briefText.match(/£([\d,]+)/)
      if (costMatch) fields.costCeiling = parseInt(costMatch[1].replace(/,/g, ''))
    }
    if (fields.maxMass === null) {
      const massMatch = briefText.match(/([\d,.]+)\s*kg/i)
      if (massMatch) fields.maxMass = parseFloat(massMatch[1].replace(/,/g, ''))
    }
    if (fields.productionVolume === null) {
      const volMatch = briefText.match(/([\d,]+)\s*(?:units?|pcs?|pieces?)\s*(?:per|\/)\s*year/i)
      if (volMatch) fields.productionVolume = volMatch[0]
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
