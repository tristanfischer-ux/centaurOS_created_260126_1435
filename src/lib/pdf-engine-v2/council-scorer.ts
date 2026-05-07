/**
 * @file council-scorer.ts — Council-based section quality scorer
 *
 * Uses 3 LLMs from different lineages to judge each section of the report.
 * Produces scores, reasons, specific code change recommendations, and source tracking.
 * This is the improvement engine — without it, we cannot get better.
 */

import type { PipelineState, SectionScore, StageResult } from './types'
import { sanitiseLlmOutput } from './sanitiser'

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
    'Constraint Capture — are all physical limits (mass, dimensions, cost) explicitly stated?',
    'Feasibility Pre-check — do the targets align with physics and market reality?',
    'Requirement Traceability — can every requirement be traced to a specific module?',
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
  'Suppliers': [
    'Supplier Capability — do the suppliers actually make these components?',
    'Geographic Viability — are suppliers accessible from the UK?',
    'Domain Experience — do suppliers have experience with the specific materials and processes required for this product class?',
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
  const councilSections = ['ExecutiveSummary', 'Brief', 'Feasibility', 'BOM', 'Cost', 'Suppliers', 'Risks']

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
        const councilScore = await scoreSectionWithCouncil(section, data)
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

async function scoreSectionWithCouncil(section: string, sectionData: string): Promise<CouncilScore> {
  const criteria = JUDGING_CRITERIA[section]
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')

  const prompt = `As an experienced HVAC engineer, evaluate this section for engineering quality. Score each criterion 1-10. For scores below 5, explain specifically what is wrong from an engineering perspective. Recommend specific code changes.

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
  const judges = [
    'x-ai/grok-4.3',          // honest adversary, 98% tool-use, 75% non-hallucination
    'xiaomi/mimo-v2.5-pro',   // honest generalist, 75% non-hallucination
    'z-ai/glm-5.1',           // schema enforcer, 74% non-hallucination
  ]

  // F8: track which model produced each vote so we can build a per-judge breakdown.
  type JudgeVote = CouncilScore & { model: string }
  const votes: JudgeVote[] = []

  const judgePromises = judges.map(async (model) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callJudge(model, prompt)
        if (result && Number.isFinite(result.overall_score)) {
          return {
            model,
            section,
            score: result.overall_score,
            criteria_scores: result.criteria_scores || [],
            overall_reasons: result.overall_reasons || [],
            code_change_recommendations: result.code_change_recommendations || [],
            source_attributions: result.source_attributions || [],
          } as JudgeVote
        }
      } catch (err) {
        if (attempt === 0) {
          console.warn(`[council-scorer] ${section} judge ${model} failed (attempt 1), retrying...`)
          await new Promise(r => setTimeout(r, 2000)) // 2s backoff
        } else {
          console.warn(`[council-scorer] ${section} judge ${model} failed (attempt 2), skipping`)
        }
      }
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
  
  // Composite score = average of all dimension scores
  const avgScore = Math.round(avgCriteria.reduce((sum, c) => sum + c.score, 0) / avgCriteria.length)

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

async function callJudge(model: string, prompt: string): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
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
  const execCost = state.costBreakdown?.unitTotalGbp || 'unknown'
  const execFeasible = state.dimensionSheet?.feasible ?? 'unknown'
  const execModules = state.modules?.length || 0
  if (state.projectId) {
    sections['ExecutiveSummary'] = [
      `Project: ${state.projectId}`,
      `Cost: ${execCost}`,
      `Feasible: ${execFeasible}`,
      `Modules: ${execModules}`,
      `Key Stats: ${state.parts?.length || 0} parts, ${state.suppliers?.length || 0} suppliers matched`
    ].join('\n')
  }

  // Brief
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

  // Regulatory
  const reg = state.research?.designBrief?.regulatory || []
  sections['Regulatory'] = reg.map(r =>
    `${r.code}: ${r.name}. ${r.summary}. Applicability: ${r.applicability || 'none'}. Design Impact: ${r.designImpact || 'none'}. Evidence: ${r.evidenceRequired || 'none'}. Owner: ${r.ownerRole || 'none'}. Gap Action: ${r.gapAction || 'none'}.`
  ).join('\n')

  // Sizing
  const ds = state.dimensionSheet
  if (ds) {
    sections['Sizing'] = [
      `Feasible: ${ds.feasible}`,
      `Envelope: ${ds.envelope?.kind} ${ds.envelope?.interior_w_mm}x${ds.envelope?.interior_d_mm}x${ds.envelope?.interior_h_mm}mm`,
      `Floor budget: ${ds.floor_budget_m2} m2`,
      `Module dimensions: ${Object.entries(ds.module_dimensions || {}).map(([k, v]) => `${k}: ${v.w_mm}x${v.d_mm}x${v.h_mm}mm, ${v.floor_m2}m2`).join('; ')}`,
      `Conflicts: ${ds.conflicts?.join('; ') || 'none'}`,
    ].join('\n')
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
  sections['Risks'] = (state.modules || []).flatMap(m =>
    (m.riskMatrix || []).map(r =>
      `${m.name} > ${r.hazard}: S${r.severity}xL${r.likelihood}=${r.severity * r.likelihood}. Cause: ${r.cause || 'none'}. Mitigation: ${r.mitigation || 'none'}. Owner: ${r.owner || 'none'}.`
    )
  ).join('\n')

  // Suppliers
  sections['Suppliers'] = (state.suppliers || []).map(s =>
    `${s.partName}: ${s.suppliers?.map(sup => `${sup.name} (${sup.score}%)`).join(', ') || 'no suppliers'}`
  ).join('\n')

  // Feasibility
  const feas = (state as any).feasibility || (state as any).gates
  if (feas) {
    sections['Feasibility'] = [
      `Verdict: ${feas.verdict || feas.status || 'unknown'}`,
      `Constraints Evaluated: ${Array.isArray(feas.constraints) ? feas.constraints.join(', ') : JSON.stringify(feas.constraints || 'none')}`,
      `Alternatives: ${Array.isArray(feas.alternatives) ? feas.alternatives.join(', ') : JSON.stringify(feas.alternatives || 'none')}`,
    ].join('\n')
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
    sections['Research'] = [
      `Report length: ${(r.report || '').length} chars`,
      `Sources: ${r.sources?.length || 0} (${r.sources?.map(s => s.title).join(', ') || 'none'})`,
      `Standards: ${r.standardCodes?.join(', ') || 'none'}`,
      `Domain: ${r.industryDomain || 'unknown'}`,
    ].join('\n')
  }

  return sections
}
