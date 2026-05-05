/**
 * @file index.ts — Orchestrator for the one-shot PDF engine v2
 *
 * Runs all 7 stages sequentially in a single process. No cron, no state
 * machine, no distributed execution. Each stage produces typed output that
 * feeds the next stage. Checkpoints are saved after each stage for resume.
 */

import { writeFileSync } from 'fs'
import { join } from 'path'
import { runTrainingDataDump } from './stages/0-training-data'
import { runResearch } from './stages/1-research'
import { runDecompose } from './stages/2-decompose'
import { runSizeLayout } from './stages/3-size-layout'
import { runBomCost } from './stages/4-bom-cost'
import { runSuppliers } from './stages/5-suppliers'
import { runReview } from './stages/6-review'
import PdfRenderer from './stages/7-pdf'
import { runPolish } from './stages/7-polish'
import { pdf } from '@react-pdf/renderer'
import React from 'react'
import { runAllGates } from './validators'
import { scoreAllSections } from './scorer'
import { runCouncilScoring } from './council-scorer'
import { scoreReport } from './score-rubric'
import { validateR290Safety } from './lib/r290-safety'
import { validateCosts } from './lib/cost-constraints'
import { classifyProduct, getRequiredFields } from './product-classifier'
import { validateBrief } from './brief-validator'
import { determineFeasibility } from './feasibility-gate'
import { scoreSection, type SectionAudit } from './universal-scorer'
import { loadAllGroundingData } from './db-queries'
import type { PipelineState, StageResult } from './types'

export interface EngineResult {
  ok: boolean
  state: PipelineState
  stages: Array<{ name: string; ok: boolean; durationMs: number; error?: string }>
  gateResults?: Array<{ gate: string; passed: boolean; findings: string[] }>
  pdf?: { filename: string; base64: string; sizeBytes: number }
  totalDurationMs: number
  totalLlmCalls: number
}

/**
 * Run the complete PDF engine pipeline.
 *
 * @param briefText - The founder's product brief (subject string from cad_lab_projects)
 * @param options - Optional: training data dossier, domain override, cost ceiling
 * @returns EngineResult with full pipeline state and PDF output
 */
export async function runPipeline(
  briefText: string,
  options?: {
    trainingDataDossier?: string
    domain?: string
    ceilingGbp?: number
    projectId?: string
  }
): Promise<EngineResult> {
  const startTime = Date.now()
  const stages: EngineResult['stages'] = []
  let llmCalls = 0

  // Generate meaningful project name from brief
  const projectName = briefText
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 6)
    .join('_')
    .toLowerCase() || 'engineering_report'

  const state: PipelineState = {
    projectId: options?.projectId || projectName,
    research: null,
    modules: [],
    dimensionSheet: null,
    parts: [],
    bomLines: [],
    costBreakdown: null,
    reviews: [],
    suppliers: [],
    proofreadFindings: null,
    sourceAttributions: [],
    llmAttributions: [],
    sectionScores: [],
  }

  function trackStage(name: string, result: StageResult<unknown>) {
    stages.push({ name, ok: result.ok, durationMs: result.durationMs, error: result.error })
    if (name !== 'pdf') llmCalls++
    console.log(`[pipeline] ${name}: ${result.ok ? 'OK' : 'FAILED'} (${result.durationMs}ms)${result.error ? ` — ${result.error}` : ''}`)
  }

  // ── Product Classification ──────────────────────────────────────────
  console.log('\n[pipeline] === Product Classification ===')
  const classification = classifyProduct(briefText)
  console.log(`[pipeline] Product class: ${classification.productClass} (confidence: ${classification.confidence})`)
  console.log(`[pipeline] Technology domains: ${classification.technologyDomains.join(', ')}`)
  console.log(`[pipeline] Hazard domains: ${classification.hazardDomains.join(', ')}`)
  console.log(`[pipeline] Manufacturing: ${classification.manufacturingArchetype}`)

  // ── Brief Validation ───────────────────────────────────────────────
  const requiredFields = getRequiredFields(classification.productClass)
  const briefValidation = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields)
  
  if (!briefValidation.isValid) {
    console.log(`[pipeline] Brief INVALID — missing: ${briefValidation.missingRequired.join(', ')}`)
    console.log(`[pipeline] Blocked reasons: ${briefValidation.blockedReasons.join('; ')}`)
  } else {
    console.log(`[pipeline] Brief VALID — all required fields present`)
  }

  // ── Load Supplier Database Grounding ─────────────────────────────────
  console.log('\n[pipeline] === Loading Supplier Database ===')
  let groundingData: Awaited<ReturnType<typeof loadAllGroundingData>> | null = null
  try {
    groundingData = await loadAllGroundingData()
    console.log(`[pipeline] Loaded ${groundingData.totalRecords} records from supplier database`)
    console.log(`[pipeline]   Materials: ${groundingData.materials.length}, Processes: ${groundingData.processes.length}, Suppliers: ${groundingData.suppliers.length}, Standards: ${groundingData.standards.length}`)
  } catch (err) {
    console.warn('[pipeline] Failed to load supplier database:', (err as Error).message)
  }

  // ── Stage 0: Training Data Knowledge Dump ──────────────────────────
  console.log('\n[pipeline] === Stage 0: Training Data Dump ===')
  let trainingDossier: string | undefined
  try {
    const stage0Result = await runTrainingDataDump(briefText)
    trackStage('training_data', stage0Result)
    if (stage0Result.ok && stage0Result.data) {
      trainingDossier = (stage0Result.data as any).dossier
    }
  } catch (err) {
    console.log('[pipeline] Stage 0 failed, continuing without dossier:', (err as Error).message)
  }

  // ── Stage 1: Research ──────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 1: Research ===')
  const researchResult = await runResearch(briefText, {
    trainingDataDossier: trainingDossier || options?.trainingDataDossier,
  })
  trackStage('research', researchResult)
  if (!researchResult.ok || !researchResult.data) {
    return { ok: false, state, stages, totalDurationMs: Date.now() - startTime, totalLlmCalls: llmCalls }
  }
  state.research = researchResult.data
  
  state.sourceAttributions.push(
    { section: 'Research', source: 'llm', detail: 'Gemini 3.1 Pro via OpenRouter' },
    { section: 'Research', source: 'user', detail: 'Founder brief text' },
    { section: 'Regulatory', source: 'llm', detail: 'Gemini 3.1 Pro — standards extraction' },
  )
  state.llmAttributions.push(
    { section: 'Research', model: 'google/gemini-3.1-pro-preview', provider: 'OpenRouter' },
  )

  // ── Brief Validation (post-research, now we have designBrief) ──────
  const briefValidationPost = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields)
  
  if (!briefValidationPost.isValid) {
    console.log('[pipeline] BRIEF INCOMPLETE — generating short blocked report')
    console.log(`[pipeline] Missing fields: ${briefValidationPost.missingRequired.join(', ')}`)
    // Skip all stages, go straight to PDF
  } else {
  // ── Feasibility Gate ───────────────────────────────────────────────
  console.log('\n[pipeline] === Feasibility Gate ===')
  const sizingResult = { feasible: null as boolean | null }  // Will be updated after sizing
  const feasibility = determineFeasibility(
    briefValidationPost,
    sizingResult,
    null,  // cost not yet computed
    classification.productClass,
  )
  ;(state as any).feasibility = feasibility
  console.log(`[pipeline] Feasibility: ${feasibility.status} — ${feasibility.reason}`)
  console.log(`[pipeline] Allowed sections: ${feasibility.allowedSections.join(', ')}`)
  
  let gateResults: Array<{ gate: string; passed: boolean; findings: string[] }> = []

  // If RED, skip heavy stages and go straight to a short blocked report
  if (feasibility.status === 'RED') {
    console.log('[pipeline] FEASIBILITY RED — generating short blocked report')
    console.log(`[pipeline] Blocked reasons: ${feasibility.blockers.join('; ')}`)
    
    // Skip: decompose, sizing, BOM, cost, suppliers, review
    // Go straight to PDF with decision page
  } else {

  // ── Stage 2: Decompose ─────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 2: Decompose ===')
  const decomposeResult = await runDecompose(state.research, {
    trainingDataDossier: trainingDossier || options?.trainingDataDossier,
  })
  trackStage('decompose', decomposeResult)
  if (!decomposeResult.ok || !decomposeResult.data) {
    return { ok: false, state, stages, totalDurationMs: Date.now() - startTime, totalLlmCalls: llmCalls }
  }
  state.modules = decomposeResult.data
  
  state.sourceAttributions.push(
    { section: 'Modules', source: 'llm', detail: 'Gemini 3.1 Pro — module decomposition' },
  )
  state.llmAttributions.push(
    { section: 'Decompose', model: 'google/gemini-3.1-pro-preview', provider: 'OpenRouter' },
  )

  // ── Stage 3: Size + Layout ─────────────────────────────────────────
  console.log('\n[pipeline] === Stage 3: Size + Layout ===')
  const sizeResult = await runSizeLayout(state.modules, {
    domain: options?.domain || state.research.industryDomain,
  })
  trackStage('size_layout', sizeResult)
  if (sizeResult.ok && sizeResult.data) {
    state.dimensionSheet = sizeResult.data
  }
  // Continue even if sizing fails (infeasible is a valid outcome)

  const isInfeasible = sizeResult.ok && sizeResult.data && !sizeResult.data.feasible
  if (isInfeasible) {
    console.log('[pipeline] Sizing INFEASIBLE — skipping all downstream stages')
    // Skip to PDF generation directly (skips BOM, cost, suppliers, review, polish)
  } else {
    // ── Stage 4: BOM + Cost ────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 4: BOM + Cost ===')
  const bomResult = await runBomCost(state.modules, state.dimensionSheet, {
    domain: options?.domain || state.research.industryDomain,
    ceilingGbp: options?.ceilingGbp,
    trainingDataDossier: trainingDossier || options?.trainingDataDossier,
  })
  trackStage('bom_cost', bomResult)
  if (!bomResult.ok || !bomResult.data) {
    return { ok: false, state, stages, totalDurationMs: Date.now() - startTime, totalLlmCalls: llmCalls }
  }
  state.parts = bomResult.data.parts
  state.bomLines = bomResult.data.bomLines
  state.costBreakdown = bomResult.data.costBreakdown
  
  state.sourceAttributions.push(
    { section: 'BOM', source: 'deterministic', detail: 'Deterministic expansion from Max keyParts' },
    { section: 'BOM', source: 'llm', detail: 'Gemini 3.1 Pro — gap-fill for missing standard hardware' },
    { section: 'Cost', source: 'deterministic', detail: 'Domain overhead multiplier model' },
  )
  state.llmAttributions.push(
    { section: 'BOM Gap-fill', model: 'google/gemini-3.1-pro-preview', provider: 'OpenRouter' },
  )

  if (state.research?.industryDomain === 'hvac_and_refrigeration' || 
      state.research?.industryDomain === 'heat_pump') {
    const safetyViolations = validateR290Safety(state.modules, state.parts)
    const costWarnings = validateCosts(state.costBreakdown, state.parts)
    
    if (safetyViolations.length > 0 || costWarnings.length > 0) {
      state.sectionScores.push({
        section: 'Safety & Compliance',
        score: safetyViolations.length > 0 ? 0 : 5,
        reasons: [...safetyViolations, ...costWarnings],
        suggestions: ['Redesign system to meet R290 safety constraints and realistic cost floors.'],
      })
    }
  }

  // ── Gate Check: Cost Reality ───────────────────────────────────────
  console.log('\n[pipeline] === Gate Check ===')
  gateResults = runAllGates(state)
  for (const gate of gateResults) {
    console.log(`[pipeline] Gate "${gate.gate}": ${gate.passed ? 'PASS' : 'FAIL'}`)
    for (const f of gate.findings) console.log(`  - ${f}`)
  }
  const criticalFail = gateResults.find(g => !g.passed && g.gate !== 'Feasibility')
  if (criticalFail) {
    console.log(`[pipeline] Critical gate failure: ${criticalFail.gate}. Aborting.`)
    return { ok: false, state, stages, gateResults, totalDurationMs: Date.now() - startTime, totalLlmCalls: llmCalls }
  }

  // ── Stage 5: Suppliers ─────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 5: Suppliers ===')
  const supplierResult = await runSuppliers(state.parts, {
    domain: options?.domain || state.research.industryDomain,
  })
  trackStage('suppliers', supplierResult)
  if (supplierResult.ok && supplierResult.data) {
    state.suppliers = supplierResult.data
  }
  
  state.sourceAttributions.push(
    { section: 'Suppliers', source: 'search', detail: 'Brave Search API — commercial supplier matching' },
  )

  // ── Stage 6: Review ────────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 6: Review ===')
  const reviewResult = await runReview(state.modules, state.research)
  trackStage('review', reviewResult)
  if (reviewResult.ok && reviewResult.data) {
    state.reviews = reviewResult.data.reviews
    state.proofreadFindings = reviewResult.data.proofreadFindings
  }
  
  state.sourceAttributions.push(
    { section: 'Reviews', source: 'llm', detail: 'Gemini 3.1 Pro — Fang engineering review' },
    { section: 'Proofreader', source: 'llm', detail: 'Gemini 3.1 Pro — cross-module consistency check' },
  )

  // ── Council Scoring (the improvement engine) ───────────────────────
  console.log('\n[pipeline] === Council Scoring ===')
  try {
    const councilResult = await runCouncilScoring(state)
    if (councilResult.ok && councilResult.data) {
      // Merge council scores into sectionScores
      for (const cs of councilResult.data) {
        const existing = state.sectionScores.find(s => s.section === cs.section)
        if (existing) {
          existing.score = cs.score
          existing.reasons = cs.overall_reasons
          existing.suggestions = cs.code_change_recommendations
        } else {
          state.sectionScores.push({
            section: cs.section,
            score: cs.score,
            reasons: cs.overall_reasons,
            suggestions: cs.code_change_recommendations,
          })
        }
      }
      // Store council data for PDF rendering
      ;(state as any).councilScores = councilResult.data
    }
  } catch (err) {
    console.log('[pipeline] Council scoring failed, using deterministic scores:', (err as Error).message)
  }

  // ── Score all sections (always runs when feasible) ─────────────────
  console.log('\n[pipeline] === Deterministic Scoring ===')
  const detScores = scoreAllSections(state)
  for (const ds of detScores) {
    if (!state.sectionScores.find(s => s.section === ds.section)) {
      state.sectionScores.push(ds)
    }
  }

  // ── Reference Report Scoring ──────────────────────────────────────
  console.log('\n[pipeline] === Reference Report Scoring ===')
  try {
    const rubricResult = scoreReport(state)
    console.log(`[pipeline] Overall score: ${rubricResult.overallScore}/100`)
    console.log(`[pipeline] Brief: ${rubricResult.briefScore}, Regulatory: ${rubricResult.regulatoryScore}, Modules: ${rubricResult.modulesScore}, BOM: ${rubricResult.bomScore}, Cost: ${rubricResult.costScore}, Risks: ${rubricResult.risksScore}`)
    ;(state as any).rubricResult = rubricResult
  } catch (err) {
    console.log('[pipeline] Reference scoring failed:', (err as Error).message)
  }

  for (const s of state.sectionScores) {
    console.log(`[pipeline] ${s.section}: ${s.score}/10 — ${(s.reasons || []).join('; ')}`)
  }
  
  // ── Polish Pass ─────────────────────────────────────────────────────
  console.log('\n[pipeline] === Polish Pass ===')
  const polishResult = await runPolish(state)
  if (polishResult.ok && polishResult.data) {
    state.modules = polishResult.data.modules
    console.log('[polish] Narrative polished successfully')
  } else {
    console.log('[polish] Polish pass skipped:', polishResult.error)
  }

  } // end else (not infeasible)
  } // end else (feasibility not RED)
  } // end else (brief is valid)

  // ── Stage 7: PDF ───────────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 7: PDF ===')
  console.log(`[pipeline] State: modules=${state.modules?.length}, parts=${state.parts?.length}, research=${!!state.research}`)
  const pdfStart = Date.now()
  try {
    const doc = React.createElement(PdfRenderer, { state }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const base64 = buffer.toString('base64')
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: true, durationMs: pdfMs })
    console.log(`[pipeline] pdf: OK (${pdfMs}ms)`)

    // After PDF generation, write QA scores to separate file
    if (state.sectionScores.length > 0) {
      const qaPath = join(process.cwd(), `qa-scores-${Date.now()}.json`)
      writeFileSync(qaPath, JSON.stringify({
        projectId: state.projectId,
        scores: state.sectionScores,
        councilScores: (state as any).councilScores || [],
        generatedAt: new Date().toISOString(),
      }, null, 2))
      console.log(`[pipeline] QA scores written to: ${qaPath}`)
    }

    const totalMs = Date.now() - startTime
    console.log(`\n[pipeline] === Complete === ${totalMs}ms total, ${llmCalls} LLM calls`)

    return {
      ok: true,
      state,
      stages,
      gateResults: gateResults,
      pdf: { filename: `engineering-report-${state.projectId}.pdf`, base64, sizeBytes: buffer.length },
      totalDurationMs: totalMs,
      totalLlmCalls: llmCalls,
    }
  } catch (pdfError) {
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: false, durationMs: pdfMs, error: (pdfError as Error).message })
    console.error(`[pipeline] pdf: FAILED (${pdfMs}ms) — ${(pdfError as Error).message}`)
    return { ok: false, state, stages, gateResults: gateResults, totalDurationMs: Date.now() - startTime, totalLlmCalls: llmCalls }
  }
}
