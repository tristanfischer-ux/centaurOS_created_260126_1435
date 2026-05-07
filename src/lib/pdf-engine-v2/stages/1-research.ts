import type { ResearchResult, StageResult, ResearchConstraints } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'
import { RESEARCH_SYNTHESIS_SYSTEM } from '../prompts'
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
      console.error('[research] JSON parsing failed. First 500 chars:', raw.slice(0, 500))
      throw new Error('Failed to parse JSON response from LLM')
    }
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

/**
 * Run the research stage
 * Input: founder's brief text (subject string)
 * Output: StageResult<ResearchResult> with report, sources, regulatory, etc.
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
