import type { ResearchResult, StageResult, ResearchConstraints, ResearchSynthesis, ResearchCompetitor, ResearchSource } from '../types'
import type { StructuredBriefJSON } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'
import { RESEARCH_SYNTHESIS_SYSTEM, RESEARCH_SYNTHESIS_SYSTEM_PA } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'

// Stage 1: Research — uses RESEARCH_SYNTHESIS_SYSTEM from prompts.ts
// The prompt is defined in prompts.ts and imported above.

export async function extractResearchConstraints(reportText: string, designBriefText: string): Promise<ResearchConstraints> {
  console.log('[research] Extracting quantitative constraints from report...')
  const systemPrompt = `Extract quantitative constraints from the following research report and design brief.
Return ONLY valid JSON matching this schema:
{
  "benchmarkPrices": [{ "product": "string", "price": number, "source": "string" }],
  "materialCosts": [{ "material": "string", "costPerKg": number, "source": "string" }],
  "regulatoryCosts": [{ "standard": "string", "costGbp": number, "weeks": number }],
  "competitorSpecs": [{ "name": "string", "mass": number, "cost": number, "keySpecs": ["string"] }]
}
If a value is not found, omit the object or use null/0 where appropriate, but try to extract as much as possible.`

  const userContent = `Text to analyze:\n${reportText}\n\nBrief:\n${designBriefText}`
  
  try {
    const json = await callOpenRouter(systemPrompt, userContent, true)
    return {
      benchmarkPrices: Array.isArray(json.benchmarkPrices) ? json.benchmarkPrices : [],
      materialCosts: Array.isArray(json.materialCosts) ? json.materialCosts : [],
      regulatoryCosts: Array.isArray(json.regulatoryCosts) ? json.regulatoryCosts : [],
      competitorSpecs: Array.isArray(json.competitorSpecs) ? json.competitorSpecs : []
    }
  } catch (err) {
    console.error('[research] Failed to extract research constraints:', err)
    return { benchmarkPrices: [], materialCosts: [], regulatoryCosts: [], competitorSpecs: [] }
  }
}

async function callOpenRouter(systemPrompt: string, userContent: string, jsonFormat = false): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300_000)

  try {
    const body: any = {
      model: 'xiaomi/mimo-v2.5-pro',
      temperature: STAGE_TEMPERATURES.research,
      max_tokens: 16384,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }
    if (jsonFormat) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`OpenRouter API returned status: ${response.status}`)
    }

    const json = await response.json()
    const msg = json.choices?.[0]?.message
    let raw = msg?.content || msg?.reasoning || ''
    if (!raw && msg?.reasoning_details?.length) {
      raw = msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
    }

    if (!raw) {
      throw new Error('No content in OpenRouter response')
    }

    console.log('[research] Response length:', raw.length, 'chars. First 200:', raw.slice(0, 200))

    let jsonStr = raw
    // Strip thinking/reasoning blocks
    jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    jsonStr = jsonStr.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').trim()
    // Strip markdown code blocks
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim()
    
    // Fix common LLM JSON issues
    // NOTE: do NOT escape newlines or tabs here — LLMs return pretty-printed JSON
    // with structural newlines between keys. Replacing \n with \\n corrupts those
    // structural whitespace characters and makes JSON.parse() fail with
    // "Expected property name or '}'" at position 1.
    // 1. Remove non-printable control characters (safe — excludes \n \t \r which JSON.parse handles)
    jsonStr = jsonStr.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    // 2. Fix trailing commas before } or ]
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

    // Find JSON object
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }
    
    // Strategy 2: try parsing
    try {
      return JSON.parse(jsonStr)
    } catch (e) {
      // Strategy 3: try to find a JSON object with 'report' field
      const reportMatch = jsonStr.match(/\{[\s\S]*"report"[\s\S]*\}/)
      if (reportMatch) {
        try {
          return JSON.parse(reportMatch[0])
        } catch (e2) {
          // Strategy 4: last resort — try trimming from first { to each subsequent }
          for (let i = jsonStr.lastIndexOf('}'); i > firstBrace; i--) {
            try {
              return JSON.parse(jsonStr.slice(firstBrace, i + 1))
            } catch (e3) { /* continue */ }
          }
        }
      }
      
      // Strategy 5: extract report field as plain text
      const reportOnly = raw.match(/"report"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
      if (reportOnly) {
        return { report: reportOnly[1], sources: [], regulatory: [], designBrief: {} }
      }

      // Strategy 6: response is prose, not JSON — use it directly as report
      // This handles cases where the LLM thinks out loud before producing content
      if (raw.length > 200 && !raw.trim().startsWith('{')) {
        console.warn('[research] Response is prose, not JSON. Using as report text.')
        return { report: raw, sources: [], regulatory: [], designBrief: {} }
      }

      console.error('[research] JSON parsing failed. First 500 chars:', raw.slice(0, 500))
      throw new Error('Failed to parse JSON response from LLM')
    }
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

/**
 * PA Stage 3 — Research Synthesis (PA_PIPELINE=true only).
 *
 * Consumes a StructuredBriefJSON (from Phase A's runBriefParsing) and a
 * Classification string. Returns a ResearchSynthesis conforming to the
 * PA Stage 3 schema from prompt_architecture.pdf pages 7-8.
 *
 * Anti-invention rules (per PA doc, verbatim):
 *   - Use real companies and real products. Do NOT invent competitor names or
 *     fictional product specs.
 *   - Any cited statistic MUST appear in claims_requiring_verification.
 *   - source_grade_overall is always 'E' (LLM-generated synthesis).
 *   - NEVER present any market claim as verified fact.
 *   - Include 3-5 competitors with differentiation rationale.
 *
 * Does NOT delete runResearch() — that function remains the fallback on
 * PA_PIPELINE=false.
 */
export async function runResearchSynthesis(
  parsedBrief: StructuredBriefJSON,
  classification: string,
): Promise<StageResult<ResearchSynthesis>> {
  const startTime = Date.now()
  console.log('[research-synthesis] Starting PA Stage 3 Research Synthesis...')
  console.log(`[research-synthesis] Classification: ${classification}`)

  // BLOCKER-3 fix: inject classification into user message so the LLM has
  // product-class context for domain-specific competitor selection and market
  // framing. PA Stage 3 prompt expects this as additional context appended
  // after the structured brief JSON.
  const userContent =
    JSON.stringify(parsedBrief, null, 2) +
    `\n\nProduct classification context: ${classification}`

  try {
    console.log('[research-synthesis] Calling OpenRouter with PA Stage 3 prompt...')
    const rawJson = await callOpenRouter(RESEARCH_SYNTHESIS_SYSTEM_PA, userContent, true)

    // ── Normalise competitors ───────────────────────────────────────────
    const competitors: ResearchCompetitor[] = Array.isArray(rawJson.competitors)
      ? rawJson.competitors.map((c: any): ResearchCompetitor => ({
          company: sanitiseLlmOutput(c.company || ''),
          product: sanitiseLlmOutput(c.product || ''),
          // Anti-invention: if pricing is absent or a raw number with no hedging,
          // wrap it to make clear it is approximate / unverified.
          pricing: _hedgePricing(c.pricing),
          key_specs: sanitiseLlmOutput(c.key_specs || ''),
          strengths: Array.isArray(c.strengths)
            ? c.strengths.map((s: any) => sanitiseLlmOutput(String(s)))
            : [sanitiseLlmOutput(String(c.strengths || ''))].filter(Boolean),
          weaknesses: Array.isArray(c.weaknesses)
            ? c.weaknesses.map((w: any) => sanitiseLlmOutput(String(w)))
            : [sanitiseLlmOutput(String(c.weaknesses || ''))].filter(Boolean),
          differentiation_angle: sanitiseLlmOutput(c.differentiation_angle || ''),
        }))
      : []

    // ── Normalise research_sources ──────────────────────────────────────
    const VALID_SOURCE_TYPES = new Set(['standard', 'market_report', 'datasheet', 'competitor_spec', 'government_policy'])
    const VALID_GRADES = new Set(['A', 'B', 'C', 'D', 'E'])

    const research_sources: ResearchSource[] = Array.isArray(rawJson.research_sources)
      ? rawJson.research_sources.map((s: any): ResearchSource => ({
          title: sanitiseLlmOutput(s.title || ''),
          type: VALID_SOURCE_TYPES.has(s.type) ? s.type : 'standard',
          year: Number(s.year) > 1900 ? Number(s.year) : new Date().getFullYear(),
          relevance: sanitiseLlmOutput(s.relevance || ''),
          source_grade: VALID_GRADES.has(s.source_grade) ? s.source_grade : 'E',
        }))
      : []

    // ── Normalise claims_requiring_verification ─────────────────────────
    const claims_requiring_verification: string[] = Array.isArray(rawJson.claims_requiring_verification)
      ? rawJson.claims_requiring_verification.map((c: any) => sanitiseLlmOutput(String(c)))
      : []

    const synthesis: ResearchSynthesis = {
      market_context: sanitiseLlmOutput(rawJson.market_context || ''),
      why_now: sanitiseLlmOutput(rawJson.why_now || ''),
      competitors,
      research_sources,
      // Always E — per PA doc: LLM-generated synthesis is always grade E.
      source_grade_overall: 'E',
      claims_requiring_verification,
    }

    console.log(
      `[research-synthesis] Complete: ${competitors.length} competitors, ` +
      `${research_sources.length} sources, ` +
      `${claims_requiring_verification.length} claims flagged for verification`
    )

    return { ok: true, data: synthesis, durationMs: Date.now() - startTime }
  } catch (error: any) {
    console.error('[research-synthesis] PA Stage 3 failed:', error)
    return {
      ok: false,
      error: error.message || 'Unknown error during PA Research Synthesis',
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Anti-invention helper: if pricing is a bare number string (no currency
 * symbol, no hedging words), prepend "Listed at approximately" so the
 * rendered report never presents an LLM guess as a verified price.
 * If pricing is null, undefined, or empty, return a safe placeholder.
 */
function _hedgePricing(raw: unknown): string {
  if (raw == null || raw === '') return 'Pricing not publicly listed'
  const str = sanitiseLlmOutput(String(raw))
  if (!str) return 'Pricing not publicly listed'
  // Already hedged if it contains qualifiers
  const HEDGE_WORDS = /approx|listed|estimated|from|starting|around|roughly|industry/i
  if (HEDGE_WORDS.test(str)) return str
  // If it looks like a bare number (possibly with currency prefix), add hedge
  if (/^[£$€]?\d[\d,.]+/.test(str)) {
    return `Listed at approximately ${str}`
  }
  return str
}

/**
 * Run the research stage — legacy path (PA_PIPELINE=false).
 * Input: founder's brief text (subject string)
 * Output: StageResult<ResearchResult> with report, sources, regulatory, etc.
 *
 * @deprecated Use `runResearchSynthesis()` on the PA path (PA_PIPELINE=true / default).
 * This function is preserved for the legacy rollback path only (PA_PIPELINE=false).
 * See STRICT-ADOPTION-MIGRATION-PLAN.md §Phase B.
 */
export async function runResearch(
  briefText: string,
  options?: { trainingDataDossier?: string }
): Promise<StageResult<ResearchResult>> {
  const startTime = Date.now()
  console.log('[research] Starting research stage...')

  const researchUserContent = options?.trainingDataDossier
    ? `Brief:\n${briefText}\n\nAdditional Context (Training Data Dossier):\n${options.trainingDataDossier}`
    : `Brief:\n${briefText}`

  try {
    console.log('[research] Generating research via OpenRouter...')
    // Use the exact prompt from prompt_architecture.pdf
    const combinedJson = await callOpenRouter(RESEARCH_SYNTHESIS_SYSTEM, `Brief: ${briefText}`)
    
    const reportText = sanitiseLlmOutput(combinedJson.report || "")
    const industryDomain = sanitiseLlmOutput(combinedJson.industryDomain || "hardware_product")

    // Merge and sanitize
    const regulatory = Array.isArray(combinedJson.regulatory) ? combinedJson.regulatory.map((r: any) => ({
      code: sanitiseLlmOutput(r.code || ""),
      name: sanitiseLlmOutput(r.name || ""),
      summary: sanitiseLlmOutput(r.summary || ""),
      status: sanitiseLlmOutput(r.status || "not-started"),
      applicability: sanitiseLlmOutput(r.applicability || ""),
      designImpact: sanitiseLlmOutput(r.designImpact || ""),
      evidenceRequired: sanitiseLlmOutput(r.evidenceRequired || ""),
      ownerRole: sanitiseLlmOutput(r.ownerRole || ""),
      gapAction: sanitiseLlmOutput(r.gapAction || "")
    })) : []

    const sources = Array.isArray(combinedJson.sources) ? combinedJson.sources.map((s: any) => ({
      title: sanitiseLlmOutput(s.title || ""),
      type: sanitiseLlmOutput(s.type || "other"),
      year: Number(s.year) || new Date().getFullYear(),
      publisher: sanitiseLlmOutput(s.publisher || ""),
      relevance: sanitiseLlmOutput(s.relevance || ""),
      uri: sanitiseLlmOutput(s.uri || "")
    })) : []

    const competitors = Array.isArray(combinedJson.competitors) ? combinedJson.competitors.map((c: any) => ({
      name: sanitiseLlmOutput(c.name || ""),
      countryIso: sanitiseLlmOutput(c.countryIso || ""),
      product: sanitiseLlmOutput(c.product || ""),
      technicalSpecs: sanitiseLlmOutput(c.technicalSpecs || ""),
      pricing: sanitiseLlmOutput(c.pricing || ""),
      strengths: sanitiseLlmOutput(c.strengths || ""),
      weaknesses: sanitiseLlmOutput(c.weaknesses || ""),
      differentiationAngle: sanitiseLlmOutput(c.differentiationAngle || "")
    })) : []

    const marketSizing = combinedJson.marketSizing ? {
      tamMUsd: Number(combinedJson.marketSizing.tamMUsd) || 0,
      samMUsd: Number(combinedJson.marketSizing.samMUsd) || 0,
      somMUsd: Number(combinedJson.marketSizing.somMUsd) || 0,
      cagrPct: Number(combinedJson.marketSizing.cagrPct) || 0,
      cagrPeriod: sanitiseLlmOutput(combinedJson.marketSizing.cagrPeriod || ""),
      primarySource: sanitiseLlmOutput(combinedJson.marketSizing.primarySource || ""),
      segments: Array.isArray(combinedJson.marketSizing.segments) ? combinedJson.marketSizing.segments.map((seg: any) => ({
        name: sanitiseLlmOutput(seg.name || ""),
        sizeMUsd: Number(seg.sizeMUsd) || 0,
        year: Number(seg.year) || new Date().getFullYear(),
        source: sanitiseLlmOutput(seg.source || "")
      })) : []
    } : undefined

    const constraints: any = combinedJson.constraints ? {
      unitCostCeilingGbp: combinedJson.constraints.unitCostCeilingGbp ? Number(combinedJson.constraints.unitCostCeilingGbp) : undefined,
      firstShipDate: combinedJson.constraints.firstShipDate ? sanitiseLlmOutput(combinedJson.constraints.firstShipDate) : undefined,
      maxMassKg: combinedJson.constraints.maxMassKg ? Number(combinedJson.constraints.maxMassKg) : undefined,
      batchSize: combinedJson.constraints.batchSize ? Number(combinedJson.constraints.batchSize) : undefined,
      markets: Array.isArray(combinedJson.constraints.markets) ? combinedJson.constraints.markets.map(String).map(sanitiseLlmOutput) : undefined,
      productionRegion: combinedJson.constraints.productionRegion ? sanitiseLlmOutput(combinedJson.constraints.productionRegion) : undefined
    } : {}

    // Extract constraints from narrative if LLM missed them
    const narrativeText = reportText + ' ' + briefText + ' ' + (combinedJson.useCase || '')
    const costMatch = narrativeText.match(/(?:£|GBP|cost|ceiling|target)[\s:]*[\d,]+(?:\.\d+)?/i)
    const massMatch = narrativeText.match(/(?:mass|weight|max)[\s:]*(?:under|below|max)?[\s]*[\d,]+(?:\.\d+)?\s*kg/i)
    const kwMatch = narrativeText.match(/(\d+)\s*kW/i)
    const copMatch = narrativeText.match(/COP\s*[>=]+\s*([\d.]+)/i)
    const volumeMatch = narrativeText.match(/(\d+)\s*units?\s*(?:per|a)\s*year/i)

    // Back-fill constraints from narrative
    if (!constraints.unitCostCeilingGbp && costMatch) {
      const num = parseFloat(costMatch[0].replace(/[^\d.]/g, ''))
      if (num > 0 && num < 1000000) constraints.unitCostCeilingGbp = num
    }
    if (!constraints.maxMassKg && massMatch) {
      const num = parseFloat(massMatch[0].replace(/[^\d.]/g, ''))
      if (num > 0) constraints.maxMassKg = num
    }
    if (!constraints.batchSize && volumeMatch) {
      const num = parseFloat(volumeMatch[1].replace(/[^\d.]/g, ''))
      if (num > 0) constraints.batchSize = num
    }

    // After LLM call, scan narrative for missing constraints
    const briefNarrative = briefText.toLowerCase()
    if (!constraints.unitCostCeilingGbp) {
      const costMatch = briefNarrative.match(/£[\d,]+/)
      if (costMatch) {
        const num = parseFloat(costMatch[0].replace(/[^\d.]/g, ''))
        if (num > 0 && num < 1000000) constraints.unitCostCeilingGbp = num
      }
    }
    if (!constraints.batchSize) {
      const volMatch = briefNarrative.match(/(\d+)\s*units?\s*(?:per|a)\s*year/)
      if (volMatch) constraints.batchSize = parseInt(volMatch[1])
    }

    const designBrief = {
      useCase: sanitiseLlmOutput(combinedJson.useCase || ""),
      targetProcess: sanitiseLlmOutput(combinedJson.targetProcess || ""),
      targetMaterial: sanitiseLlmOutput(combinedJson.targetMaterial || ""),
      toleranceTarget: sanitiseLlmOutput(combinedJson.toleranceTarget || ""),
      quantityTarget: sanitiseLlmOutput(combinedJson.quantityTarget || ""),
      complianceNotes: sanitiseLlmOutput(combinedJson.complianceNotes || ""),
      mission: sanitiseLlmOutput(combinedJson.mission || ""),
      targetCustomers: sanitiseLlmOutput(combinedJson.targetCustomers || ""),
      whyNow: sanitiseLlmOutput(combinedJson.whyNow || ""),
      constraints,
      regulatory,
      sources,
      marketSizing,
      competitors
    }

    const result: ResearchResult = {
      report: reportText,
      industryDomain,
      sources: sources.map((s: any) => ({ uri: s.uri || "", title: s.title || "" })),
      designBrief,
      trainingDataDossier: options?.trainingDataDossier
    }

    console.log('[research] Successfully generated and extracted research report.')
    return {
      ok: true,
      data: result,
      durationMs: Date.now() - startTime
    }
  } catch (error: any) {
    console.error('[research] Research stage failed:', error)
    return {
      ok: false,
      error: error.message || 'Unknown error during research stage',
      durationMs: Date.now() - startTime
    }
  }
}
