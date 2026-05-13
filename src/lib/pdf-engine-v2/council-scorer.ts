/**
 * @file council-scorer.ts — Council-based section quality scorer
 *
 * Uses 3 LLMs from different lineages to judge each section of the report.
 * Produces scores, reasons, specific code change recommendations, and source tracking.
 * This is the improvement engine — without it, we cannot get better.
 */

import type { PipelineState, SectionScore, StageResult } from './types'
import { sanitiseLlmOutput } from './sanitiser'

// ─── B1: Product-class → domain expert mapping ─────────────────────────────
// Used to inject the right persona into the judge prompt so judges evaluate
// content against the correct domain standard rather than defaulting to HVAC.

const PRODUCT_CLASS_DOMAIN_EXPERT: Record<string, string> = {
  // Thermal / HVAC
  thermal_system:        'HVAC and refrigeration engineer',

  // Energy storage
  energy_storage:        'power systems and battery engineer',

  // Aerospace (crewed / uncrewed / orbital)
  haps:                  'aerospace engineer specialising in high-altitude unmanned systems',
  drone:                 'aerospace engineer specialising in unmanned aerial vehicles',
  auv:                   'marine systems and subsea engineer',
  aerospace:             'aerospace engineer',

  // Medical / life-sciences
  wearable_medical:      'biomedical engineer specialising in wearable medical devices',
  bioreactor:            'bioprocess and biomedical engineer',
  medical_device:        'biomedical and regulatory engineer',

  // Power electronics
  ev_charger:            'power electronics engineer specialising in EV charging systems',

  // Computing / AI hardware
  edge_ai_server:        'computer hardware and data-centre engineer',

  // Agriculture / controlled environment
  vertical_farm:         'agricultural engineer specialising in controlled-environment agriculture',

  // Electronics manufacturing
  pcb_assembly:          'electronics manufacturing engineer',

  // Automotive / vehicle
  vehicle:               'automotive engineer',

  // Consumer and general electronics
  consumer_electronics:  'consumer electronics engineer',

  // Industrial machinery
  industrial_machine:    'industrial mechanical engineer',

  // Home appliances
  appliance:             'mechanical and electrical appliance engineer',

  // Clockwork / precision mechanisms
  mechanical_clockwork:  'precision mechanical engineer',

  // Fluid systems
  fluid_processing:      'fluid systems and process engineer',

  // Structural products
  structural_product:    'structural and civil engineer',

  // Robotics
  robotics:              'robotics and mechatronics engineer',
}

/**
 * Returns the domain expert persona for the judge prompt.
 * Falls back to 'experienced engineer' when productClass is absent or unrecognised.
 */
function getDomainExpert(productClass: string | undefined): string {
  if (!productClass) return 'experienced engineer'
  return PRODUCT_CLASS_DOMAIN_EXPERT[productClass] ?? 'experienced engineer'
}

export interface SourceAttribution {
  section: string
  sourceType: 'llm' | 'deterministic' | 'search' | 'database' | 'user'
  detail: string  // e.g. "Gemini 3.1 Pro — module decomposition", "Cost model calculation", "Brave Search API"
}

export interface CouncilScore {
  section: string
  score: number  // 1-10
  criteria_scores: Array<{ criterion: string; score: number; reason: string }>
  overall_reasons: string[]
  code_change_recommendations: string[]
  source_attributions: SourceAttribution[]
  // F8: per-judge breakdown so the scorecard shows score spread, not just the average.
  judgeBreakdown?: Array<{ model: string; score: number; criteria_scores: Array<{ criterion: string; score: number }> }>
}

// ─── Judging Criteria Per Section ──────────────────────────────────────────

const ENGINEERING_DIMENSIONS = [
  'Technical Accuracy — are the engineering specifications physically correct and achievable?',
  'Safety Compliance — does the design satisfy relevant standards (BS EN 378, IEC 60335, etc.)?',
  'Cost Realism — are the cost estimates grounded in real market data, not heuristics?',
  'Manufacturing Feasibility — can this actually be built at the stated volume with the stated processes?',
  'Design Completeness — are all critical components specified (no missing items)?',
]

const SECTION_ENGINEERING_CRITERIA: Record<string, string[]> = {
  'ExecutiveSummary': [
    'Key Metrics — are the most important numbers (cost, feasibility, timeline) prominently displayed?',
    'Clarity — can a non-technical founder understand the summary?',
    'Completeness — are all major sections represented in summary form?',
  ],
  'Brief': [
    // SCORE-BP1 (2026-05-09): rubric updated for StructuredBriefJSON (PA Stage 1 output).
    // Previous criteria were written for prose brief text (legacy path). PA Stage 1
    // outputs structured field extraction — judge field completeness and anti-invention
    // discipline, not prose narrative quality.
    'Constraint Completeness — are unit_cost_ceiling, max_mass_kg, batch_size, design_life, target_process, target_material, and operating_environment all populated or explicitly null (never invented)?',
    'Source-Grading Discipline — are constraint values correctly tagged source=user (explicitly stated by founder) vs source=inferred (derived from product class) — no cross-contamination?',
    'Anti-Invention Compliance — are fields that are genuinely missing from the founder text left as null rather than guessed? (missing_mandatory_fields should be honest)',
    'Safety Standards Coverage — are applicable safety standards listed with correct source_grade (A=official body, B=industry body, C=LLM-inferred)?',
    'Narrative Field Quality — are product_description, mission_statement, target_customers, and why_now concise, grounded in the founder text, and free of hallucinated specifics?',
  ],
  'Feasibility': [
    'Verdict Accuracy — is the feasibility verdict (GREEN/AMBER/RED) justified by the constraints?',
    'Constraint Coverage — are all critical constraints evaluated (mass, cost, thermal, regulatory)?',
    'Alternative Suggestions — when RED/AMBER, are actionable alternatives provided?',
  ],
  'Regulatory': [
    'Standard Applicability — are the cited standards actually required for this product?',
    'Safety Gap Analysis — are product-class-specific safety requirements addressed (flammable refrigerants, battery thermal runaway, pressure systems, biocompatibility, etc.)?',
    'Certification Path — is the sequence of certifications realistic and complete?',
  ],
  'Sizing': [
    'Physical Feasibility — do the dimensions fit within the envelope?',
    'Thermal Consistency — are heat transfer calculations internally consistent?',
    'Margin Analysis — are safety margins stated and justified?',
  ],
  'Modules': [
    'Component Specificity — are real components specified (not generic descriptions)?',
    'Interface Definition — how modules connect (electrical, mechanical, fluid)?',
    'Failure Mode Realism — are failure modes specific to this product class?',
  ],
  'BOM': [
    'Part Completeness — are all critical components present (no missing items)?',
    'Cost Traceability — can every cost be traced to a real source?',
    'Material Correctness — are materials appropriate for the operating environment?',
    'Volume Appropriateness — are processes suitable for the stated production volume?',
  ],
  'Cost': [
    'NRE Realism — is the non-recurring engineering estimate grounded in reality?',
    'Unit Cost Breakdown — does the cost structure make sense for this product?',
    'Ceiling Compliance — does the cost meet the stated target?',
  ],
  'Risks': [
    'Domain-Specific Hazards — are product-class-specific failure modes covered (e.g. R290 for heat pumps, lithium thermal runaway for BESS, pressure hull integrity for AUV)?',
    'Severity Calibration — are ratings calibrated to real consequences?',
    'Mitigation Specificity — are mitigations actionable and verifiable?',
  ],
  // Scorer key 'Suppliers' is kept for backwards-compatibility with QA JSON files.
  // The visible PDF section is now "Assembly Shortlist" (renamed 2026-05-09).
  // These criteria evaluate assembly partners (who can build the full product),
  // not per-part distributors (which are embedded in BOM lines).
  'Suppliers': [
    'Assembly Capability — do the listed partners actually assemble products of this class?',
    'Geographic Viability — are assembly partners accessible from the UK?',
    'Domain Experience — do partners have experience with the specific processes and materials required for this product class?',
  ],
  'Research': [
    'Technical Depth — does the research demonstrate understanding of the product?',
    'Source Quality — are the cited sources credible and recent?',
    'Design Relevance — does the research inform actual design decisions?',
  ],
  'Proofreader': [
    'Issue Detection — are genuine errors and inconsistencies identified?',
    'False Positive Rate — are flagged issues actually problems, not noise?',
    'Actionability — are fix recommendations specific and implementable?',
  ],
  'AuditLog': [
    'Completeness — are all pipeline stages documented with outcomes?',
    'Traceability — can each decision be traced to specific data inputs?',
    'Transparency — are failures and workarounds honestly reported?',
  ],
}

const JUDGING_CRITERIA: Record<string, string[]> = Object.fromEntries(
  Object.entries(SECTION_ENGINEERING_CRITERIA).map(([section, specific]) => [
    section,
    [...ENGINEERING_DIMENSIONS, ...specific]
  ])
)

// ─── Council Scoring Function ──────────────────────────────────────────────

/**
 * Run the council to score all sections of the pipeline output.
 * Uses 3 LLMs from different lineages for independent assessment.
 */
export async function runCouncilScoring(state: PipelineState): Promise<StageResult<CouncilScore[]>> {
  const startTime = Date.now()
  console.log('[council-scorer] Starting council scoring of all sections...')

  const sectionData = extractSectionData(state)
  const scores: CouncilScore[] = []

  // Score each section — council for ALL sections
  const sections = Object.keys(JUDGING_CRITERIA)
  // SCORE-005 (2026-05-07): promote Suppliers + Risks into the council tier.
  // They were always-deterministic before (scored 8/10 if the section
  // existed), which isn't quality signal. Council judges now evaluate
  // supplier relevance + risk-matrix completeness + severity distribution.
  // If the council fails, the deterministic score is the fallback.
  // Proofreader + AuditLog excluded: Proofreader data is `proofreadFindings`
  // (string | null, often null → council scores 1 on empty data) and AuditLog
  // data lives on EngineResult, not PipelineState (extraction is dead code).
  // Both fall through to the deterministic scorer via the full `sections` list.
  const councilSections = ['ExecutiveSummary', 'Brief', 'Feasibility', 'BOM', 'Cost', 'Suppliers', 'Risks', 'Regulatory', 'Sizing', 'Modules', 'Research']

  for (const section of sections) {
    const data = sectionData[section]
    if (!data || data.length < 10) {
      scores.push({
        section,
        score: 1,
        criteria_scores: [],
        overall_reasons: ['Section has insufficient data to evaluate'],
        code_change_recommendations: [`Improve ${section} stage to produce more data`],
        source_attributions: [],
      })
      continue
    }

    if (councilSections.includes(section)) {
      // Council scoring for high-impact sections
      try {
        const councilScore = await scoreSectionWithCouncil(section, data, state.productClass)
        scores.push(councilScore)
        console.log(`[council-scorer] ${section}: ${councilScore.score}/10 (council)`)
      } catch (err) {
        console.error(`[council-scorer] ${section} council scoring failed:`, (err as Error).message)
        // SCORE-005 (2026-05-07): Suppliers + Risks have a reliable
        // deterministic scorer — fall back to it when council fails.
        // Brief / BOM / Cost have no meaningful deterministic fallback
        // (content-quality can't be keyword-counted), so they get the
        // SCORE-002 "failed to score" sentinel instead.
        if (section === 'Suppliers' || section === 'Risks') {
          const detScore = deterministicScore(section, data)
          scores.push({
            ...detScore,
            overall_reasons: [
              `Council failed: ${(err as Error).message}`,
              ...(detScore.overall_reasons || []),
            ],
          })
          console.log(`[council-scorer] ${section}: ${detScore.score}/10 (deterministic fallback after council failure)`)
        } else {
          // SCORE-002: emit score=-1 sentinel when the council couldn't
          // score a section. Renderer shows "—" and the average calc
          // excludes it.
          scores.push({
            section,
            score: -1,
            criteria_scores: [],
            overall_reasons: [`Council scoring failed: ${(err as Error).message}`],
            code_change_recommendations: ['Re-run the council for this section once OpenRouter credit + judge availability are restored.'],
            source_attributions: [],
          } as any)
        }
      }
    } else {
      // Deterministic scoring for lower-impact sections
      const score = deterministicScore(section, data)
      scores.push(score)
      console.log(`[council-scorer] ${section}: ${score.score}/10 (deterministic)`)
    }
  }

  // SCORE-002 (2026-05-07): compute the average only over scored sections.
  // Sections with score === -1 (council failure) are excluded so a flaky
  // OpenRouter round doesn't drag the average down via synthetic 5s.
  const scored = scores.filter(s => s.score >= 0)
  const failed = scores.length - scored.length
  const avg = scored.length > 0
    ? scored.reduce((s, c) => s + c.score, 0) / scored.length
    : 0
  console.log(
    `[council-scorer] Complete. Average: ${avg.toFixed(1)}/10 ` +
    `(${scored.length} scored, ${failed} failed-to-score${failed > 0 ? ' — see logs' : ''})`
  )

  return {
    ok: true,
    data: scores,
    durationMs: Date.now() - startTime,
  }
}

// ─── Score a Single Section with 3 Judges ──────────────────────────────────

async function scoreSectionWithCouncil(section: string, rawSectionData: string, productClass?: string): Promise<CouncilScore> {
  // H5: sanitise LLM-generated section content before injecting into judge prompt.
  const sectionData = sanitiseLlmOutput(rawSectionData)

  const criteria = JUDGING_CRITERIA[section]
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')

  // B1: dynamic domain expert persona based on the product class.
  const domainExpert = getDomainExpert(productClass)

  const prompt = `As an experienced ${domainExpert}, evaluate this section for engineering quality. Score each criterion 1-10. For scores below 5, explain specifically what is wrong from an engineering perspective. Recommend specific code changes.

JUDGING CRITERIA:
${criteriaList}

SECTION CONTENT:
${sectionData.slice(0, 8000)}

Also track which data came from where.

Return ONLY valid JSON:
{
  "criteria_scores": [
    {"criterion": "criterion name", "score": 7, "reason": "specific observation"}
  ],
  "overall_score": 7,
  "overall_reasons": ["observation 1", "observation 2"],
  "code_change_recommendations": ["specific code change 1", "specific code change 2"],
  "source_attributions": [
    {"section": "${section}", "sourceType": "llm", "detail": "Gemini 3.1 Pro — module decomposition"}
  ]
}`

  // SCORE-F9 (2026-05-07): exclude engine-lineage models from judge council
  // to prevent self-evaluation. Previously Gemini (Chase) and DeepSeek (Max,
  // Jian, Priya, Finn) were both judges and content generators.
  //
  // B2 (2026-05-08): replaced xiaomi/mimo-v2.5-pro — it generates Stage 0
  // training data and Stage 1 research content, making it a self-judge.
  // Replaced with openai/gpt-5.4 (OpenAI lineage, zero overlap with content
  // generators Gemini/MiMo/DeepSeek, strong engineering non-hallucination).
  // Verified available on OpenRouter 2026-05-08. Alternates if gpt-5.4 is
  // unavailable: moonshotai/kimi-k2.6 or meta-llama/llama-4-maverick.
  //
  // B5 (2026-05-10): removed z-ai/glm-5.1 — frequent attempt-1 failures
  // caused the retry loop to accumulate across 11 sections and time out the
  // entire pipeline before the PDF was written (vfarm, BESS, all 3 recent runs
  // killed at this stage). GLM-5.1 was also a recurring parse-miss source on
  // dense tables (multimodal council memory). Replaced with
  // mistralai/mistral-large — different lineage from all content generators,
  // reliable JSON schema compliance, no self-judge risk.
  //
  // Iter-09 (2026-05-13): Mistral Large replaced — recurring HTTP 400s in
  // iter-06/07/08 (drawer forgeos_gotchas_mistral_unreliable). Flash-Lite is
  // 8.2% hallucination, 329 tok/s, judges quality+schema reliably. Different
  // lineage (Google) from the content generators (Anthropic + xAI + Asian).
  const judges = [
    'x-ai/grok-4.3',                // honest adversary, 98% tool-use, 75% non-hallucination
    'openai/gpt-5.4',               // B2: replaced MiMo — OpenAI lineage, no overlap with content generators
    'google/gemini-3.1-flash-lite', // Iter-09: replaced Mistral Large — Google lineage, 8.2% hallucination, fast + reliable JSON
  ]

  // B6 (2026-05-10): per-judge retry + timeout config.
  // Iter-09 (2026-05-13): Flash-Lite inherits Mistral's hardened config
  // (maxAttempts: 2, timeoutMs: 30_000) — keeps the worst-case overhead
  // bounded (2 attempts × 11 sections × 30s = 660s cap) even though
  // Flash-Lite is far faster and more reliable than Mistral was.
  // Other judges keep the default (2 retries = 3 attempts, 60s timeout).
  interface JudgeConfig { maxAttempts: number; timeoutMs: number }
  const JUDGE_CONFIG: Record<string, JudgeConfig> = {
    'google/gemini-3.1-flash-lite': { maxAttempts: 2, timeoutMs: 30_000 },
  }
  const DEFAULT_JUDGE_CONFIG: JudgeConfig = { maxAttempts: 3, timeoutMs: 60_000 }

  // F8: track which model produced each vote so we can build a per-judge breakdown.
  type JudgeVote = CouncilScore & { model: string }
  const votes: JudgeVote[] = []

  const judgePromises = judges.map(async (model) => {
    const cfg = JUDGE_CONFIG[model] ?? DEFAULT_JUDGE_CONFIG
    for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
      try {
        const result = await callJudge(model, prompt, cfg.timeoutMs)
        if (result && Number.isFinite(result.overall_score)) {
          return {
            model,
            section,
            score: Math.max(1, Math.min(10, Math.round(result.overall_score))),
            criteria_scores: result.criteria_scores || [],
            overall_reasons: result.overall_reasons || [],
            code_change_recommendations: result.code_change_recommendations || [],
            source_attributions: result.source_attributions || [],
          } as JudgeVote
        }
      } catch (err) {
        if (attempt < cfg.maxAttempts - 1) {
          console.warn(`[council-scorer] ${section} judge ${model} failed (attempt ${attempt + 1}), retrying...`)
          await new Promise(r => setTimeout(r, 2000)) // 2s backoff
        } else {
          console.warn(`[council-scorer] ${section} judge ${model} failed (attempt ${attempt + 1}), skipping`)
        }
      }
    }
    // Iter-09 (2026-05-13): replaced Mistral with Flash-Lite — same skip-and-mean
    // fallback applies if Flash-Lite fails all attempts.
    if (model === 'google/gemini-3.1-flash-lite') {
      console.warn(`[council-scorer] Flash-Lite skipped for section ${section} — using 2-judge mean`)
    }
    return null
  })

  const results = await Promise.allSettled(judgePromises)
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      votes.push(r.value)
    }
  }

  if (votes.length === 0) {
    throw new Error('All judges failed')
  }

  const allReasons = [...new Set(votes.flatMap(v => v.overall_reasons))]
  const allRecommendations = [...new Set(votes.flatMap(v => v.code_change_recommendations))]
  const avgCriteria = criteria.map((c, i) => {
    const criterionScores = votes
      .filter(v => v.criteria_scores[i])
      .map(v => v.criteria_scores[i].score)
    const avg = criterionScores.length > 0
      ? Math.round(criterionScores.reduce((s, sc) => s + sc, 0) / criterionScores.length)
      : 5
    const reason = votes.find(v => v.criteria_scores[i]?.reason)?.criteria_scores[i]?.reason || ''
    return { criterion: c, score: avg, reason }
  })

  // B4 (2026-05-08): composite uses overall_score directly (mean across judges),
  // not the double-mean over criteria. This matches what the dashboard displays
  // (judgeBreakdown[].score is also from overall_score) so RL trains on the same
  // signal the scorecard shows. The criteria breakdown is kept for display/debug.
  const avgScore = Math.round(votes.reduce((sum, v) => sum + v.score, 0) / votes.length)

  // Deduplicate source attributions
  const allAttributions = votes.flatMap(v => v.source_attributions)
  const uniqueAttributions = allAttributions.filter(
    (v, i, a) => a.findIndex(t => t.detail === v.detail && t.sourceType === v.sourceType) === i
  )

  // F8: build per-judge breakdown so the scorecard shows score spread.
  const judgeBreakdown = votes.map(v => ({
    model: v.model,
    score: v.score,
    criteria_scores: v.criteria_scores.map(cs => ({ criterion: cs.criterion, score: cs.score })),
  }))

  return {
    section,
    score: avgScore,
    criteria_scores: avgCriteria,
    overall_reasons: allReasons.slice(0, 5),
    code_change_recommendations: allRecommendations.slice(0, 5),
    source_attributions: uniqueAttributions,
    judgeBreakdown,
  }
}

// ─── Call a Single Judge ───────────────────────────────────────────────────

// B6 (2026-05-10): timeoutMs param added — callers supply per-judge timeout.
// Iter-09 (2026-05-13): Flash-Lite uses 30_000; all others default to 60_000.
async function callJudge(model: string, prompt: string, timeoutMs = 60_000): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        // WS-D 2026-05-13: 150k (was 4096) — Tristan approved; truncation more expensive than unused tokens.
        max_tokens: 150_000,
        // B3 (2026-05-08): deterministic reward signal required for RL.
        // temperature: 0 forces greedy decoding. top_p: 1 is a no-op at
        // temperature 0 but included for explicit clarity. OpenRouter passes
        // these through to all three judges (Grok, GPT, Flash-Lite).
        temperature: 0,
        top_p: 1,
        messages: [{ role: 'user', content: prompt }],
        // Iter-09 (2026-05-13): Flash-Lite specific — council scoring is multi-hop
        // reasoning on structured data, so use thinking_level: 'medium' for the
        // judgement quality lift. No-op on other models.
        ...(model === 'google/gemini-3.1-flash-lite'
          ? { thinking_level: 'medium' }
          : {}),
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) throw new Error(`API ${response.status}`)

    const json = await response.json()
    const msg = json.choices?.[0]?.message
    let raw = msg?.content || msg?.reasoning || ''
    if (!raw && msg?.reasoning_details?.length) {
      raw = msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
    }

    if (!raw) throw new Error('No content')

    // Extract JSON
    let jsonStr = raw.replace(/^\s*```json\s*/m, '').replace(/```\s*$/m, '').trim()
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }

    return JSON.parse(jsonStr)
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

// ─── Deterministic Scoring (for sections not judged by council) ─────────────

function deterministicScore(section: string, data: string): CouncilScore {
  const criteria = JUDGING_CRITERIA[section]
  const reasons: string[] = []
  const recommendations: string[] = []
  let score = 5

  // Length-based quality signal
  if (data.length > 2000) { score += 1; reasons.push('Substantial content') }
  if (data.length > 5000) { score += 1; reasons.push('Comprehensive content') }
  if (data.length < 200) { score -= 2; reasons.push('Very sparse content') }

  // Specificity signals
  const hasNumbers = /\d+\.?\d*/.test(data)
  if (hasNumbers) { score += 0.5; reasons.push('Contains numerical data') }

  const hasUnits = /mm|kg|GBP|pounds|watts|kW|bars?|litres?/.test(data)
  if (hasUnits) { score += 0.5; reasons.push('Contains units of measurement') }

  // Problem signals
  if (data.includes('not-started')) { score -= 0.5; recommendations.push('Address not-started items') }
  if (data.includes('UNKNOWN')) { score -= 0.5; recommendations.push('Replace UNKNOWN with actual data') }

  return {
    section,
    score: Math.max(1, Math.min(10, Math.round(score))),
    criteria_scores: criteria.map(c => ({ criterion: c, score: Math.round(score), reason: 'Deterministic assessment' })),
    overall_reasons: reasons.length > 0 ? reasons : ['No specific observations'],
    code_change_recommendations: recommendations,
    source_attributions: [],
  }
}

// ─── Extract Section Data from Pipeline State ──────────────────────────────

function extractSectionData(state: PipelineState): Record<string, string> {
  const sections: Record<string, string> = {}

  // ExecutiveSummary
  // SCORE-ES1 (2026-05-09): PA path writes rich synthesis data to
  // state.researchSynthesis, state.parsedBrief, state.regulatoryExtraction,
  // state.costBreakdown, and state.dimensionSheet. The legacy 5-line stub
  // only read unitTotalGbp + feasible + module count — judges correctly
  // scored this as an "insufficient data" skeleton (2/10). On PA path,
  // synthesise a richer summary that covers all major section outcomes.
  const execCost = state.costBreakdown?.unitTotalGbp || 'unknown'
  const execFeasible = state.dimensionSheet?.feasible ?? 'unknown'
  const execModules = state.modules?.length || 0

  const rsSynthesis = (state as any).researchSynthesis
  const reParsed = (state as any).parsedBrief
  const reExtraction = (state as any).regulatoryExtraction

  if (state.projectId && (rsSynthesis || reParsed)) {
    // PA path: synthesise rich executive summary from all available stage outputs
    const pb = reParsed
    const rs = rsSynthesis

    const costLine = state.costBreakdown
      ? `Unit cost: £${state.costBreakdown.unitTotalGbp.toFixed(2)} (ceiling: ${state.costBreakdown.ceilingGbp != null ? `£${state.costBreakdown.ceilingGbp}` : 'none'}, NRE: £${state.costBreakdown.nreTotalGbp.toFixed(0)})`
      : 'Cost: not computed'

    const sizingLine = state.dimensionSheet
      ? `Sizing: ${state.dimensionSheet.feasible ? 'FEASIBLE' : 'INFEASIBLE'} — ${state.dimensionSheet.envelope?.kind || 'unknown'} envelope ${state.dimensionSheet.envelope?.interior_w_mm || '?'}x${state.dimensionSheet.envelope?.interior_d_mm || '?'}x${state.dimensionSheet.envelope?.interior_h_mm || '?'}mm`
      : 'Sizing: not computed'

    // PA DimensionSheetPA extended fields
    const dsPA = state.dimensionSheet as any
    const sizingPALines: string[] = []
    if (dsPA?.volumeUtilisationPct != null) sizingPALines.push(`Volume utilisation: ${dsPA.volumeUtilisationPct}%`)
    if (dsPA?.massUtilisationPct != null) sizingPALines.push(`Mass utilisation: ${dsPA.massUtilisationPct}%`)
    if (dsPA?.massMarginNote) sizingPALines.push(`Mass margin: ${dsPA.massMarginNote}`)
    if (dsPA?.zones?.length) sizingPALines.push(`Zones: ${dsPA.zones.map((z: any) => `${z.name} (${z.volumeM3?.toFixed(3)} m³, ${z.massKg} kg)`).join('; ')}`)

    const briefLines = pb ? [
      `Product: ${pb.product_description || ''}`,
      `Mission: ${pb.mission_statement || ''}`,
      `Customers: ${pb.target_customers || ''}`,
      `Why now: ${pb.why_now || ''}`,
      `Confidence: ${pb.confidence || ''}`,
      `Missing fields: ${(pb.missing_mandatory_fields || []).join(', ') || 'none'}`,
      pb.constraints?.unit_cost_ceiling?.value != null
        ? `Cost ceiling: ${pb.constraints.unit_cost_ceiling.value} ${pb.constraints.unit_cost_ceiling.currency} (${pb.constraints.unit_cost_ceiling.source})`
        : '',
      pb.constraints?.max_mass_kg?.value != null
        ? `Mass limit: ${pb.constraints.max_mass_kg.value} kg (${pb.constraints.max_mass_kg.source})`
        : '',
    ].filter(Boolean) : []

    const researchLines = rs ? [
      `Market context: ${(rs.market_context || '').slice(0, 500)}`,
      `Why now (market): ${(rs.why_now || '').slice(0, 200)}`,
      `Competitors: ${(rs.competitors || []).map((c: any) => `${c.company} — ${c.product} (${c.pricing})`).join('; ')}`,
      `Claims requiring verification: ${(rs.claims_requiring_verification || []).join('; ')}`,
    ].filter(Boolean) : []

    const regLines = reExtraction?.regulatory_entries?.length
      ? [`Regulatory standards (${reExtraction.regulatory_entries.length}): ${reExtraction.regulatory_entries.slice(0, 5).map((e: any) => `${e.standard_name} (${e.jurisdiction})`).join(', ')}`]
      : []

    const moduleLines = (state.modules || []).slice(0, 6).map(m =>
      `Module: ${m.name} — ${m.purpose}. Parts: ${(m.keyParts || []).join(', ')}. Risks: ${(m.riskMatrix || []).length}.`
    )

    const perModuleCost = state.costBreakdown?.perModule?.length
      ? `Per-module costs: ${state.costBreakdown.perModule.map(m => `${m.moduleName}: £${m.totalGbp}`).join(', ')}`
      : ''

    sections['ExecutiveSummary'] = [
      `Project: ${state.projectId}`,
      costLine,
      perModuleCost,
      sizingLine,
      ...sizingPALines,
      `Modules: ${execModules} | Parts: ${state.parts?.length || 0} | Suppliers: ${state.suppliers?.length || 0}`,
      '',
      '--- BRIEF ---',
      ...briefLines,
      '',
      '--- MARKET RESEARCH ---',
      ...researchLines,
      '',
      '--- REGULATORY ---',
      ...regLines,
      '',
      '--- MODULES ---',
      ...moduleLines,
    ].filter(l => l !== undefined).join('\n')
  } else if (state.projectId) {
    // Legacy path: minimal summary
    sections['ExecutiveSummary'] = [
      `Project: ${state.projectId}`,
      `Cost: ${execCost}`,
      `Feasible: ${execFeasible}`,
      `Modules: ${execModules}`,
      `Key Stats: ${state.parts?.length || 0} parts, ${state.suppliers?.length || 0} suppliers matched`
    ].join('\n')
  }

  // Brief
  // SCORE-BP1 (2026-05-09): When brief_parsing (PA Stage 1) has run, use
  // state.parsedBrief (StructuredBriefJSON — the actual stage output) as the
  // primary data source. The legacy designBrief proxy is seeded with only two
  // fields (useCase + two constraints) from parsedBrief, leaving mission,
  // target_customers, why_now, safety_standards, and all constraint source-tags
  // blank. Judges legitimately score this near-empty template at 2/10. This is
  // a scorer mis-calibration bug, not a prompt quality problem.
  //
  // Rubric for brief_parsing: evaluate structured field extraction quality —
  // constraint completeness, source-grading discipline, anti-invention rules
  // (null values where source is 'user'), missing_mandatory_fields honesty.
  const pb = (state as any).parsedBrief
  if (pb) {
    const c = pb.constraints || {}
    const safetyStds = (c.safety_standards || [])
      .map((s: any) => `${s.code} (${s.source_grade || '?'})`)
      .join(', ') || 'none'
    const addlConstraints = (c.additional_constraints || [])
      .map((a: any) => `${a.name}: ${a.value} (src=${a.source})`)
      .join('; ') || 'none'
    const missing = (pb.missing_mandatory_fields || []).join(', ') || 'none'
    sections['Brief'] = [
      `product_description: ${pb.product_description || ''}`,
      `mission_statement: ${pb.mission_statement || ''}`,
      `target_customers: ${pb.target_customers || ''}`,
      `why_now: ${pb.why_now || ''}`,
      `confidence: ${pb.confidence || ''}`,
      `missing_mandatory_fields: ${missing}`,
      `constraints.unit_cost_ceiling: ${c.unit_cost_ceiling?.value ?? 'null'} ${c.unit_cost_ceiling?.currency || ''} (src=${c.unit_cost_ceiling?.source || '?'})`,
      `constraints.max_mass_kg: ${c.max_mass_kg?.value ?? 'null'} (src=${c.max_mass_kg?.source || '?'})`,
      `constraints.max_dimensions_mm: ${JSON.stringify(c.max_dimensions_mm || {})}`,
      `constraints.target_process: ${c.target_process?.value ?? 'null'} (src=${c.target_process?.source || '?'})`,
      `constraints.target_material: ${c.target_material?.value ?? 'null'} (src=${c.target_material?.source || '?'})`,
      `constraints.batch_size: ${c.batch_size?.value ?? 'null'} (src=${c.batch_size?.source || '?'})`,
      `constraints.design_life: ${c.design_life?.value ?? 'null'} (src=${c.design_life?.source || '?'})`,
      `constraints.operating_environment: ${JSON.stringify(c.operating_environment || {})}`,
      `constraints.target_performance: ${JSON.stringify(c.target_performance || {})}`,
      `constraints.safety_standards: ${safetyStds}`,
      `constraints.additional_constraints: ${addlConstraints}`,
    ].join('\n')
  } else {
    // Fallback for non-PA path or states where brief_parsing has not run:
    // use the legacy designBrief proxy.
    const b = state.research?.designBrief
    if (b) {
      sections['Brief'] = [
        `Mission: ${b.mission || ''}`,
        `Use Case: ${b.useCase || ''}`,
        `Target Customers: ${b.targetCustomers || ''}`,
        `Why Now: ${b.whyNow || ''}`,
        `Process: ${b.targetProcess || ''}`,
        `Material: ${b.targetMaterial || ''}`,
        `Tolerance: ${b.toleranceTarget || ''}`,
        `Quantity: ${b.quantityTarget || ''}`,
        `Compliance: ${b.complianceNotes || ''}`,
        `Cost Ceiling: ${b.constraints?.unitCostCeilingGbp || 'not set'}`,
        `Max Mass: ${b.constraints?.maxMassKg || 'not set'}`,
      ].join('\n')
    }
  }

  // Regulatory
  // SCORE-REG1 (2026-05-09): PA Stage 4 writes state.regulatoryExtraction
  // (RegulatoryExtraction with rich engineering_impact, evidence_required,
  // gap_action, etc.). The scorer was only reading the legacy
  // state.research.designBrief.regulatory shape. On PA path, prefer
  // regulatoryExtraction for richer content. Legacy fallback unchanged.
  const paReg = (state as any).regulatoryExtraction
  if (paReg?.regulatory_entries?.length > 0) {
    sections['Regulatory'] = paReg.regulatory_entries.map((e: any) =>
      [
        `Standard: ${e.standard_name} ${e.version_date ? `(${e.version_date})` : ''}`,
        `Jurisdiction: ${e.jurisdiction || 'unknown'} | Owner: ${e.owner || 'unknown'} | Status: ${e.status || 'not_started'}`,
        `Claim type: ${e.claim_type || 'requirement'}`,
        `Applicability: ${e.applicability || 'none'}`,
        `Engineering impact: ${e.engineering_impact || 'none'}`,
        `Evidence required: ${e.evidence_required || 'none'}`,
        `Gap action: ${e.gap_action || 'none'}`,
        `Source grade: ${e.source_grade || 'C'} | Verification: ${e.verification_status || 'UNVERIFIED'}`,
        e.verification_note ? `Verification note: ${e.verification_note}` : '',
      ].filter(Boolean).join('\n')
    ).join('\n\n')
  } else {
    const reg = state.research?.designBrief?.regulatory || []
    if (reg.length > 0) {
      sections['Regulatory'] = reg.map(r =>
        `${r.code}: ${r.name}. ${r.summary}. Applicability: ${r.applicability || 'none'}. Design Impact: ${r.designImpact || 'none'}. Evidence: ${r.evidenceRequired || 'none'}. Owner: ${r.ownerRole || 'none'}. Gap Action: ${r.gapAction || 'none'}.`
      ).join('\n')
    } else {
      // Fallback: extract from research report text
      const report = state.research?.report || ''
      const standardMatches = report.match(/(?:IEC|BS EN|ISO|UL|EASA|DNV|MDR|G99|F-Gas|RoHS|CE|UKCA)[^\n.,]{0,80}/gi) || []
      const regulatoryText = standardMatches.length > 0
        ? `Regulatory standards identified in research:\n${standardMatches.join('\n')}`
        : 'No regulatory data available in research output.'
      sections['Regulatory'] = regulatoryText
    }
  }

  // Sizing
  // SCORE-SZ1 (2026-05-09): PA Stage 7a (DimensionSheetPA) adds zones[],
  // volumeUtilisationPct, massUtilisationPct, externalDimensionsMm,
  // internalDimensionsMm, clearanceNotes, massMarginNote. The legacy
  // extraction only read the base DimensionSheet fields (4 lines), so judges
  // scored 2/10 for "only geometric assertions with no engineering content".
  // Now extract all PA-extended fields when present.
  const ds = state.dimensionSheet
  if (ds) {
    const dsPA = ds as any  // DimensionSheetPA — PA-extended fields, all optional
    const baseLines = [
      `Feasible: ${ds.feasible}`,
      `Rules domain: ${ds.rules_domain || 'unknown'}`,
      `Envelope type: ${ds.envelope?.kind || 'unknown'}`,
      `Envelope interior: ${ds.envelope?.interior_w_mm || '?'}mm W x ${ds.envelope?.interior_d_mm || '?'}mm D x ${ds.envelope?.interior_h_mm || '?'}mm H`,
      `Interior volume: ${ds.envelope?.interior_volume_m3 != null ? `${ds.envelope.interior_volume_m3.toFixed(3)} m³` : 'unknown'}`,
      `Interior floor area: ${ds.envelope?.interior_floor_m2 != null ? `${ds.envelope.interior_floor_m2} m²` : 'unknown'}`,
      `Floor budget: ${ds.floor_budget_m2} m²`,
      `Module dimensions: ${Object.entries(ds.module_dimensions || {}).map(([k, v]) => `${k}: ${v.w_mm}x${v.d_mm}x${v.h_mm}mm (${v.floor_m2}m², mount=${v.mount || '?'})`).join('; ')}`,
      `Conflicts: ${ds.conflicts?.join('; ') || 'none'}`,
      `Recommendations: ${ds.recommendations?.join('; ') || 'none'}`,
    ]

    // PA-extended DimensionSheetPA fields
    const paLines: string[] = []
    if (dsPA.externalDimensionsMm) paLines.push(`External envelope: ${dsPA.externalDimensionsMm.w}x${dsPA.externalDimensionsMm.d}x${dsPA.externalDimensionsMm.h}mm`)
    if (dsPA.internalDimensionsMm) paLines.push(`Internal usable: ${dsPA.internalDimensionsMm.w}x${dsPA.internalDimensionsMm.d}x${dsPA.internalDimensionsMm.h}mm`)
    if (dsPA.tareMassKg != null) paLines.push(`Tare mass: ${dsPA.tareMassKg} kg`)
    if (dsPA.availablePayloadMassKg != null) paLines.push(`Available payload: ${dsPA.availablePayloadMassKg} kg`)
    if (dsPA.volumeUtilisationPct != null) paLines.push(`Volume utilisation: ${dsPA.volumeUtilisationPct}%`)
    if (dsPA.massUtilisationPct != null) paLines.push(`Mass utilisation: ${dsPA.massUtilisationPct}%`)
    if (dsPA.massMarginNote) paLines.push(`Mass margin note: ${dsPA.massMarginNote}`)
    if (dsPA.clearanceNotes) paLines.push(`Clearance/access notes: ${dsPA.clearanceNotes}`)
    if (dsPA.zones?.length) {
      paLines.push(`Zones (${dsPA.zones.length}):`)
      for (const z of dsPA.zones) {
        paLines.push(`  ${z.name}: length=${z.lengthMm}mm, volume=${z.volumeM3?.toFixed(3)}m³, mass=${z.massKg}kg — ${z.contents}`)
      }
    }

    sections['Sizing'] = [...baseLines, ...(paLines.length ? ['', '--- PA Extended Sizing ---', ...paLines] : [])].join('\n')
  }

  // Modules
  sections['Modules'] = (state.modules || []).map(m =>
    `${m.name}: ${m.description}. Purpose: ${m.purpose}. Key Parts: ${(m.keyParts || []).join(', ')}. Failure Modes: ${(m.failureModes || []).join(', ')}. Risks: ${(m.riskMatrix || []).map(r => `${r.hazard} (S${r.severity}xL${r.likelihood})`).join(', ')}.`
  ).join('\n\n')

  // BOM
  sections['BOM'] = (state.parts || []).map(p =>
    `${p.partNumber}: ${p.name}, process=${p.process || 'unknown'}, cost=${p.estimatedUnitCostGbp || 0}, mass=${p.massKg || 0}kg, module=${p.sourceModuleId || 'none'}`
  ).join('\n')

  // Cost
  const c = state.costBreakdown
  if (c) {
    sections['Cost'] = [
      `Unit total: ${c.unitTotalGbp}`,
      `Ceiling: ${c.ceilingGbp || 'none'}`,
      `Non-recurring engineering: ${c.nreTotalGbp}`,
      `Overhead multiplier: ${c.overheadMultiplier}x`,
      `Per-module: ${c.perModule.map(m => `${m.moduleName}: ${m.totalGbp}`).join(', ')}`,
    ].join('\n')
  }

  // Risks
  // SCORE-RK1 (2026-05-09): The previous extraction only pulled hazard/severity/
  // likelihood/cause/mitigation/owner from riskMatrix — on PA path all judges
  // unanimously scored 1/10 with "Section has insufficient data to evaluate"
  // because riskMatrix rows are often sparse on the legacy Module shape.
  //
  // PA Stage 5 (runDecomposePA) populates ModulePA.failure_modes[] — a richer
  // FMEA format with mode, cause, local_effect, system_effect. The RiskRow type
  // also carries consequence, existingControls, verificationTest, residualSeverity,
  // residualLikelihood, residualDetection — none were extracted before.
  //
  // Fix: extract BOTH riskMatrix (with all RiskRow fields) AND failure_modes.
  const risksLines: string[] = []
  for (const m of state.modules || []) {
    const mPA = m as any  // ModulePA — may have failure_modes[], open_questions[], maturity
    const moduleName = m.name

    // Base riskMatrix rows (RiskRow) — extract ALL fields, not just 3
    for (const r of m.riskMatrix || []) {
      const rpn = r.severity * r.likelihood * (r.detection ?? 5)
      risksLines.push(
        `${moduleName} | RISK: ${r.hazard} (id=${r.id || '?'})` +
        ` | Severity=${r.severity} Likelihood=${r.likelihood} Detection=${r.detection ?? '?'} RPN=${rpn}` +
        ` | Cause: ${r.cause || 'none'}` +
        ` | Consequence: ${r.consequence || 'none'}` +
        ` | Existing controls: ${r.existingControls || 'none'}` +
        ` | Mitigation: ${r.mitigation || 'none'}` +
        ` | Verification test: ${r.verificationTest || 'none'}` +
        ` | Owner: ${r.owner || 'none'}` +
        (r.residualSeverity != null ? ` | Residual: S${r.residualSeverity}xL${r.residualLikelihood ?? '?'}xD${r.residualDetection ?? '?'}` : '')
      )
    }

    // PA-path ModulePA.failure_modes[] — FMEA format
    for (const fm of mPA.failure_modes || []) {
      risksLines.push(
        `${moduleName} | FMEA: ${fm.mode}` +
        ` | Cause: ${fm.cause || 'unknown'}` +
        ` | Local effect: ${fm.local_effect || 'none'}` +
        ` | System effect: ${fm.system_effect || 'none'}`
      )
    }

    // PA module open questions surfaced to risk register
    if (mPA.open_questions?.length) {
      risksLines.push(`${moduleName} | Open questions: ${mPA.open_questions.join('; ')}`)
    }

    // Legacy failureModes string array (non-PA path)
    if (!mPA.failure_modes && m.failureModes?.length) {
      risksLines.push(`${moduleName} | Failure modes: ${m.failureModes.join('; ')}`)
    }
  }
  sections['Risks'] = risksLines.join('\n')

  // Suppliers
  // SCORE-SUP1 (2026-05-09): On v2 BOM path (BOM_PIPELINE=v2), the integrated
  // stage builds a rich sectionSuppliers markdown string stored at
  // (state as any).sectionSuppliers. This includes supplier names, scores,
  // URLs, countries, processMatch verification, and sourcing-review flags.
  //
  // The legacy extraction only read state.suppliers[].suppliers[].name + score —
  // judges saw fabricated probability strings with no engineering content (2/10).
  //
  // Fix: prefer sectionSuppliers (v2 markdown) when present. On legacy path,
  // enrich with reason, country, certifications, processes, processMatch.
  const sectionSuppliersV2 = (state as any).sectionSuppliers as string | undefined
  if (sectionSuppliersV2 && sectionSuppliersV2.length > 10) {
    // v2 BOM path: use the pre-built rich markdown section
    sections['Suppliers'] = sectionSuppliersV2
  } else {
    // Legacy path or v1 BOM: enrich SupplierMatch extraction
    const supplierLines = (state.suppliers || []).map(s => {
      if (!s.suppliers?.length) return `${s.partName}: no suppliers matched`
      const supList = s.suppliers.map(sup =>
        `  - ${sup.name} (score=${sup.score}%${sup.country ? `, ${sup.country}` : ''})` +
        (sup.processMatch && sup.processMatch !== 'unverified' ? ` [verified: ${sup.processMatch}]` : ' [unverified]') +
        (sup.url ? ` — ${sup.url}` : '') +
        (sup.reason ? `\n    Reason: ${sup.reason.slice(0, 200)}` : '') +
        (sup.certifications?.length ? `\n    Certifications: ${sup.certifications.join(', ')}` : '') +
        (sup.processes?.length ? `\n    Processes: ${sup.processes.join(', ')}` : '')
      ).join('\n')
      return `${s.partName}:\n${supList}`
    })
    sections['Suppliers'] = supplierLines.join('\n\n')
  }

  // Feasibility
  // SCORE-FE1 (2026-05-09): The FeasibilityResult has rich structured data —
  // blockers[], warnings[], decisionPageData (biggestBlocker, missingInputs,
  // commercialWarning, engineeringWarning, nextActions), compactBanner —
  // none of which were extracted before. Judges scored 1-2/10 for "bare
  // verdict and constraint list with no engineering content."
  //
  // Also: on PA path, parsedBrief.constraints has the structured constraint
  // values with source-grading. Extract those directly instead of JSON.stringify
  // of the legacy designBrief.constraints blob (which often has undefined fields).
  const feas = (state as any).feasibility
  const dsFeas = state.dimensionSheet

  const feasLines: string[] = []

  if (feas) {
    feasLines.push(`Verdict: ${feas.status || feas.verdict || 'unknown'}`)
    if (feas.compactBanner) feasLines.push(`Summary: ${feas.compactBanner}`)
    feasLines.push(`Can generate full report: ${feas.canGenerateFullReport ?? 'unknown'}`)
    feasLines.push(`Reason: ${feas.reason || 'none'}`)

    if (feas.blockers?.length) {
      feasLines.push(`Blockers (${feas.blockers.length}):`)
      feas.blockers.forEach((b: string) => feasLines.push(`  BLOCKER: ${b}`))
    } else {
      feasLines.push('Blockers: none')
    }

    if (feas.warnings?.length) {
      feasLines.push(`Warnings (${feas.warnings.length}):`)
      feas.warnings.forEach((w: string) => feasLines.push(`  WARNING: ${w}`))
    } else {
      feasLines.push('Warnings: none')
    }

    const dp = feas.decisionPageData
    if (dp) {
      feasLines.push(`Decision: ${dp.verdict || 'unknown'}`)
      if (dp.biggestBlocker) feasLines.push(`Biggest blocker: ${dp.biggestBlocker}`)
      if (dp.missingInputs?.length) feasLines.push(`Missing inputs: ${dp.missingInputs.join(', ')}`)
      if (dp.commercialWarning) feasLines.push(`Commercial warning: ${dp.commercialWarning}`)
      if (dp.engineeringWarning) feasLines.push(`Engineering warning: ${dp.engineeringWarning}`)
      if (dp.nextActions?.length) feasLines.push(`Next actions: ${dp.nextActions.join('; ')}`)
    }

    if (feas.reportType) feasLines.push(`Report type (PA router): ${feas.reportType}`)
    if (feas.allowedSections?.length) feasLines.push(`Allowed sections: ${feas.allowedSections.join(', ')}`)
  }

  // Sizing feasibility
  if (dsFeas) {
    feasLines.push(`Sizing feasible: ${dsFeas.feasible}`)
    if (dsFeas.conflicts?.length) feasLines.push(`Sizing conflicts: ${dsFeas.conflicts.join('; ')}`)
    if (dsFeas.recommendations?.length) feasLines.push(`Sizing recommendations: ${dsFeas.recommendations.join('; ')}`)
  }

  // PA path: structured constraints from parsedBrief (richer than designBrief proxy)
  const pbFeas = (state as any).parsedBrief
  if (pbFeas?.constraints) {
    const c = pbFeas.constraints
    feasLines.push('--- PA Constraints (source-graded) ---')
    if (c.unit_cost_ceiling?.value != null) feasLines.push(`  Cost ceiling: ${c.unit_cost_ceiling.value} ${c.unit_cost_ceiling.currency} (${c.unit_cost_ceiling.source})`)
    if (c.max_mass_kg?.value != null) feasLines.push(`  Max mass: ${c.max_mass_kg.value} kg (${c.max_mass_kg.source})`)
    if (c.batch_size?.value != null) feasLines.push(`  Batch size: ${c.batch_size.value} units (${c.batch_size.source})`)
    if (c.design_life?.value != null) feasLines.push(`  Design life: ${c.design_life.value} (${c.design_life.source})`)
    if (c.target_process?.value) feasLines.push(`  Target process: ${c.target_process.value} (${c.target_process.source})`)
    if (c.target_material?.value) feasLines.push(`  Target material: ${c.target_material.value} (${c.target_material.source})`)
    if (c.operating_environment?.temp_min_c != null || c.operating_environment?.temp_max_c != null) {
      feasLines.push(`  Operating temp: ${c.operating_environment.temp_min_c ?? '?'}°C to ${c.operating_environment.temp_max_c ?? '?'}°C`)
    }
    const safetyStds = (c.safety_standards || []).map((s: any) => s.standard || s.code).filter(Boolean)
    if (safetyStds.length) feasLines.push(`  Safety standards: ${safetyStds.join(', ')}`)
  } else {
    // Legacy path: use designBrief constraints
    const briefFeas = state.research?.designBrief
    if (briefFeas?.constraints) {
      feasLines.push(`Constraints: cost_ceiling=£${briefFeas.constraints.unitCostCeilingGbp || '?'} max_mass=${briefFeas.constraints.maxMassKg || '?'}kg batch=${briefFeas.constraints.batchSize || '?'}`)
    }
  }

  const feasText = feasLines.join('\n')
  if (feasText.length >= 10) {
    sections['Feasibility'] = feasText
  }

  // Proofreader
  const pr = state.proofreadFindings || (state as any).proofreaderFindings || (state as any).proofreader
  if (pr) {
    sections['Proofreader'] = typeof pr === 'string' ? pr : JSON.stringify(pr)
  }

  // AuditLog
  const al = (state as any).auditLog || (state as any).stageResults
  if (al) {
    sections['AuditLog'] = Array.isArray(al)
      ? al.map((a: any) => `${a.stage || a.name || 'unknown'}: ${a.status || 'unknown'} (${a.duration || a.durationMs || 0}ms). Outputs: ${a.outputs || a.keyOutputs ? JSON.stringify(a.outputs || a.keyOutputs) : 'none'}`).join('\n')
      : JSON.stringify(al)
  }

  // Research
  const r = state.research
  if (r) {
    let text = ''
    if (r.report && r.report.length > 100) {
      text = r.report
    } else if (r.trainingDataDossier && r.trainingDataDossier.length > 100) {
      text = r.trainingDataDossier
    } else if (r.sources && r.sources.length > 0) {
      text = r.sources.map(s => `${s.title}: ${s.relevance || ''}`).join('\n')
    }

    const researchText = [
      `Report length: ${(r.report || '').length} chars`,
      `Training Dossier length: ${(r.trainingDataDossier || '').length} chars`,
      `Sources: ${r.sources?.length || 0} (${r.sources?.map(s => s.title).join(', ') || 'none'})`,
      `Standards: ${r.standardCodes?.join(', ') || 'none'}`,
      `Domain: ${r.industryDomain || 'unknown'}`,
      `Market Sizing TAM: ${r.designBrief?.marketSizing?.tamMUsd || 'unknown'} M USD`,
      `Competitors: ${r.designBrief?.competitors?.length || 0}`,
      `\nResearch Content:\n${text.slice(0, 4000)}`
    ].filter(Boolean).join('\n')
    
    if (researchText.length >= 10) {
      sections['Research'] = researchText
    }
  }

  return sections
}
