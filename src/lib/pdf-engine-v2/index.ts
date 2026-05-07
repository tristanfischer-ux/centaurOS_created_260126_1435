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
import { runBriefExpansion, shouldExpandBrief } from './stages/0.5-brief-expansion'
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
import { scoreReport, computeCompoundScore } from './score-rubric'
import { recordScoringRun, deriveBriefLabel } from './lib/scoring-history'
import { validateR290Safety } from './lib/r290-safety'
import { validateCosts } from './lib/cost-constraints'
import { classifyProduct, getRequiredFields } from './product-classifier'
import { checkRequiredParts } from './lib/required-parts-manifest'
import { validateBrief } from './brief-validator'
import { determineFeasibility } from './feasibility-gate'
import { scoreSection, type SectionAudit } from './universal-scorer'
import { loadAllGroundingData } from './db-queries'
import type { PipelineState, StageResult } from './types'
import { extractSpecs, summariseSpecs } from './lib/spec-extraction'

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
 * A4 (2026-05-06): produce an honest error PDF when a critical stage
 * fails. Called from the stage-failure branches in runPipeline instead of
 * the old `return { ok: false, ...}` which silently dropped the PDF.
 *
 * The main PdfRenderer tolerates partial state (A3 normaliseState layer);
 * it picks up `state.pipelineError` and renders a prominent banner on the
 * feasibility gate page so the founder sees exactly which stage failed
 * and why. Sections whose data didn't survive the failure render "—" or
 * "Section unavailable" instead of blank pages.
 */
async function generateErrorPdf(
  state: PipelineState,
  stages: EngineResult['stages'],
  llmCalls: number,
  startTime: number,
  gateResults?: EngineResult['gateResults'],
): Promise<EngineResult> {
  const pdfStart = Date.now()
  try {
    const doc = React.createElement(PdfRenderer, { state }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const base64 = buffer.toString('base64')
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: true, durationMs: pdfMs })
    console.log(`[pipeline] pdf (error path): OK (${pdfMs}ms, ${Math.round(buffer.length / 1024)}KB)`)

    return {
      ok: false,  // Pipeline didn't complete successfully.
      state,
      stages,
      gateResults,
      pdf: {
        filename: `engineering-report-${state.projectId}-ERROR.pdf`,
        base64,
        sizeBytes: buffer.length,
      },
      totalDurationMs: Date.now() - startTime,
      totalLlmCalls: llmCalls,
    }
  } catch (pdfError) {
    const pdfMs = Date.now() - pdfStart
    stages.push({
      name: 'pdf',
      ok: false,
      durationMs: pdfMs,
      error: (pdfError as Error).message,
    })
    console.error(`[pipeline] Error PDF generation FAILED: ${(pdfError as Error).message}`)
    return {
      ok: false,
      state,
      stages,
      gateResults,
      totalDurationMs: Date.now() - startTime,
      totalLlmCalls: llmCalls,
    }
  }
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

  // CX-002 FIX (2026-05-06): generate a human-readable project name from the
  // brief. Previously the first 6 words of the raw brief were snake-cased,
  // producing "_bess_test_brief_we_are" because briefs start with a markdown
  // header like "# BESS Test Brief". Now strip markdown headers and boilerplate
  // words first, then take a clean noun-phrase.
  const projectName = (() => {
    // Remove markdown headers (lines starting with #) and empty lines.
    const cleaned = briefText
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join(' ')
      .trim()
    // Take content up to the first full stop (usually the opening description sentence).
    const firstSentence = cleaned.split(/\.\s+/)[0] || cleaned
    // Remove common sentence-opening filler ("We are designing", "This is a",
    // "The product is", "A brief for", "The following brief describes").
    const BOILERPLATE = /^(?:we are (?:designing|building|developing|creating)|this is|this document|this brief|this report|the product is|the design is|a brief for|the following|describes?|outlines?|covers?|introduces?|for)\s+(?:a |an |the |our )?/i
    const trimmed = firstSentence.replace(BOILERPLATE, '').trim()
    const tokens = trimmed
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 7)
    const title = tokens.join(' ').trim()
    if (!title) return 'engineering_report'
    // Return title as-is for human display, with underscore-cased filesystem
    // id appended in projectId below.
    return title.toLowerCase().replace(/\s+/g, '_')
  })()

  const state: PipelineState = {
    projectId: options?.projectId || projectName,
    // UX1: store the raw user-submitted brief so the PDF renderer can show
    // the exact prompt verbatim in Section 1.
    briefText,
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

  // A1 FIX (2026-05-06): gateResults must be function-scoped so the final
  // return statement can reference it on every code path (brief-invalid,
  // feasibility-RED, sizing-INFEASIBLE, and the happy path all end at the
  // single return block below). Previously declared inside a nested else,
  // which made it a ReferenceError at the PDF stage on every non-RED run.
  let gateResults: Array<{ gate: string; passed: boolean; findings: string[] }> = []


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
    console.log(`[pipeline] Loaded ${groundingData.totalRecords} records from grounding database`)
    console.log(`[pipeline]   Materials: ${groundingData.materials.length}, Processes: ${groundingData.processes.length}, Standards: ${groundingData.standards.length}`)
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
    // A4 (2026-05-06): do not silently drop the PDF when a critical stage
    // fails. Set pipelineError and fall through — the renderer produces a
    // short error report with the brief echoed and the stage that failed.
    state.pipelineError = {
      stage: 'research',
      message: researchResult.error || 'Research stage returned no data',
      occurredAt: new Date().toISOString(),
      recoverable: false,
    }
    console.error(`[pipeline] Research failed: ${researchResult.error}. Producing error PDF.`)
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'PIPELINE_ERROR',
      })
    } catch { /* scoring history is non-critical */ }
    return await generateErrorPdf(state, stages, llmCalls, startTime)
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

  // ── Stage 0.5: Brief Expansion ─────────────────────────────────────
  if (shouldExpandBrief(briefText, state.research?.designBrief)) {
    console.log('\n[pipeline] === Stage 0.5: Brief Expansion ===')
    const expansionResult = await runBriefExpansion(briefText, classification.productClass, classification)
    trackStage('brief_expansion', expansionResult)
    if (expansionResult.ok && expansionResult.data) {
      state.briefExpansion = expansionResult.data
      // Merge expanded fields into designBrief so downstream stages and validators can use them
      if (state.research && state.research.designBrief) {
        state.research.designBrief = {
          ...state.research.designBrief,
          ...expansionResult.data.expandedFields,
        }
      }
      state.sourceAttributions.push(
        { section: 'Brief Interpretation', source: 'llm', detail: 'DeepSeek V4 Flash — brief expansion' }
      )
      state.llmAttributions.push(
        { section: 'Brief Expansion', model: 'deepseek/deepseek-v4-flash', provider: 'OpenRouter' }
      )
    }
  }

  // ── Product Specs Extraction (deterministic) ───────────────────────
  // Per-cell qty realism (2026-05-06): pull canonical specs out of the
  // brief + DesignBrief now that both are available. The BOM stage will
  // use these to override LLM-guessed quantities.
  const productSpecs = extractSpecs(briefText, state.research?.designBrief || null)
  ;(state as any).productSpecs = productSpecs
  console.log(`[pipeline] Product specs extracted: ${summariseSpecs(productSpecs)}`)

  // ── Brief Validation (post-research, now we have designBrief) ──────
  const briefValidationPost = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields)
  
  if (!briefValidationPost.isValid) {
    console.log('[pipeline] BRIEF INCOMPLETE — generating short blocked report')
    console.log(`[pipeline] Missing fields: ${briefValidationPost.missingRequired.join(', ')}`)
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'BRIEF_INCOMPLETE',
      })
    } catch { /* scoring history is non-critical */ }
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
  // BENCH-L1: stamp productClass on state so the PDF renderer can do
  // benchmark lookups without re-classifying.
  state.productClass = classification.productClass
  console.log(`[pipeline] Feasibility: ${feasibility.status} — ${feasibility.reason}`)
  console.log(`[pipeline] Allowed sections: ${feasibility.allowedSections.join(', ')}`)

  // gateResults declared at function scope (see A1 fix above). Reset here.
  gateResults = []

  // If RED, skip heavy stages and go straight to a short blocked report
  if (feasibility.status === 'RED') {
    console.log('[pipeline] FEASIBILITY RED — generating short blocked report')
    console.log(`[pipeline] Blocked reasons: ${feasibility.blockers.join('; ')}`)
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'INFEASIBLE',
      })
    } catch { /* scoring history is non-critical */ }
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
    // A4: decompose is critical — without modules we can't make a BOM or
    // cost. Record the failure and produce an honest error PDF.
    state.pipelineError = {
      stage: 'decompose',
      message: decomposeResult.error || 'Decompose stage returned no modules',
      occurredAt: new Date().toISOString(),
      recoverable: false,
    }
    console.error(`[pipeline] Decompose failed: ${decomposeResult.error}. Producing error PDF.`)
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'PIPELINE_ERROR',
      })
    } catch { /* scoring history is non-critical */ }
    return await generateErrorPdf(state, stages, llmCalls, startTime)
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
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'INFEASIBLE',
      })
    } catch { /* scoring history is non-critical */ }
    // Skip to PDF generation directly (skips BOM, cost, suppliers, review, polish)
  } else {
    // ── Stage 4: BOM + Cost ────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 4: BOM + Cost ===')
  const bomResult = await runBomCost(state.modules, state.dimensionSheet, {
    domain: options?.domain || state.research.industryDomain,
    ceilingGbp: options?.ceilingGbp,
    trainingDataDossier: trainingDossier || options?.trainingDataDossier,
    // A2 FIX (2026-05-06): pass the grounding data that index.ts already
    // loaded at the top of the pipeline. Previously runBomCost re-queried
    // Supabase internally, doubling DB load and preventing the caller from
    // providing a pre-warmed local catalogue (future Phase C work).
    grounding: groundingData ?? undefined,
    // Per-cell qty realism (2026-05-06): pass specs + classifier output so
    // the BOM stage can override LLM-guessed quantities deterministically.
    productSpecs,
    productClass: classification.productClass,
  })
  trackStage('bom_cost', bomResult)
  if (!bomResult.ok || !bomResult.data) {
    // A4: BOM failure — critical for cost section. Produce error PDF with
    // whatever state we already have (research + modules + sizing).
    state.pipelineError = {
      stage: 'bom_cost',
      message: bomResult.error || 'BOM stage returned no data',
      occurredAt: new Date().toISOString(),
      recoverable: true,  // Research + modules survive; cost & suppliers drop.
    }
    console.error(`[pipeline] BOM failed: ${bomResult.error}. Producing error PDF with partial state.`)
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'PIPELINE_ERROR',
      })
    } catch { /* scoring history is non-critical */ }
    return await generateErrorPdf(state, stages, llmCalls, startTime)
  }
  state.parts = bomResult.data.parts
  state.bomLines = bomResult.data.bomLines
  state.costBreakdown = bomResult.data.costBreakdown
  
  // ── Required Parts Manifest Check ──────────────────────────────────
  const manifestResult = checkRequiredParts(classification.productClass, state.parts || [])
  if (manifestResult.missing.length > 0) {
    console.log(`[required-parts] ${manifestResult.missing.length} missing parts for ${classification.productClass}: ${manifestResult.missing.map(p => p.name).join(', ')}`)
    // Store on state for PDF rendering
    ;(state as any).missingParts = manifestResult.missing
  }
  
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
    // A4: critical gate failure — still produce a PDF so the founder
    // sees what failed and why, rather than silently dropping the report.
    state.pipelineError = {
      stage: 'gate_' + criticalFail.gate.toLowerCase().replace(/\s+/g, '_'),
      message: `Gate "${criticalFail.gate}" failed: ${criticalFail.findings.join('; ')}`,
      occurredAt: new Date().toISOString(),
      recoverable: true,
    }
    console.log(`[pipeline] Critical gate failure: ${criticalFail.gate}. Producing error PDF with partial state.`)
    // J1a: emit scoring record so the dashboard shows this run as failed.
    try {
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: -1,
        rubric: -1,
        councilAvg: null,
        councilScored: 0,
        councilFailed: 0,
        sections: [],
        formulaVersion: 'f7',
        status: 'PIPELINE_ERROR',
      })
    } catch { /* scoring history is non-critical */ }
    return await generateErrorPdf(state, stages, llmCalls, startTime, gateResults)
  }

  // ── Stage 5: Suppliers ─────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 5: Suppliers ===')
  const supplierResult = await runSuppliers(state.parts, {
    domain: options?.domain || state.research.industryDomain,
    // D3 (2026-05-06): product class drives domain-tag filtering so the
    // corpus re-rank demotes obviously-wrong suppliers.
    productClass: classification.productClass,
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
    console.log(`[pipeline] Rubric (completeness) score: ${rubricResult.overallScore}/100`)
    console.log(`[pipeline] Brief: ${rubricResult.briefScore}, Regulatory: ${rubricResult.regulatoryScore}, Modules: ${rubricResult.modulesScore}, BOM: ${rubricResult.bomScore}, Cost: ${rubricResult.costScore}, Risks: ${rubricResult.risksScore}`)
    ;(state as any).rubricResult = rubricResult

    // SCORE-001 (2026-05-07): compound headline score combining rubric
    // (completeness) with council quality average. This is the number to
    // report — rubric alone was misleading (95/100 for BOMs the council
    // found at 4/10).
    const councilScoresForCompound = (state.sectionScores || []).map(s => ({
      section: s.section,
      score: s.score,
    }))
    const compound = computeCompoundScore(rubricResult.overallScore, councilScoresForCompound)
    ;(state as any).compoundScore = compound
    if (compound.councilAvg !== null) {
      console.log(
        `[pipeline] COMPOUND score: ${compound.compound}/100 ` +
        `(rubric ${compound.rubric}/100 × 0.4 + council ${compound.councilAvg.toFixed(1)}/10 × 0.6) ` +
        `— ${compound.councilScored} sections scored, ${compound.councilFailed} failed`
      )
    } else {
      console.log(
        `[pipeline] COMPOUND score: ${compound.compound}/100 (rubric only — no council signal; ${compound.councilFailed} sections failed to score)`
      )
    }

    // SCORE-004 (2026-05-07): append this run to the cross-run history
    // file + regenerate the auto-refreshing HTML dashboard. Zero-cost,
    // local only. Lets Tristan see trends across N runs without re-running
    // the engine manually per brief.
    try {
      // J2: extract per-judge breakdown from council scores for dashboard display
      const rawCouncil = (state as any).councilScores as Array<{
        section: string
        judgeBreakdown?: Array<{ model: string; score: number }>
      }> | undefined
      const councilScoresForHistory = rawCouncil?.map(cs => ({
        section: cs.section,
        judgeBreakdown: cs.judgeBreakdown?.map(j => ({ model: j.model, score: j.score })),
      }))
      recordScoringRun({
        timestamp: new Date().toISOString(),
        projectId: state.projectId,
        briefLabel: deriveBriefLabel(state.projectId),
        compound: compound.compound,
        rubric: compound.rubric,
        councilAvg: compound.councilAvg,
        councilScored: compound.councilScored,
        councilFailed: compound.councilFailed,
        sections: councilScoresForCompound,
        formulaVersion: compound.formulaVersion,
        councilScores: councilScoresForHistory,
      })
      console.log(`[pipeline] scoring history updated — dashboard at ~/Downloads/engine-evidence/scoring-dashboard.html`)
    } catch (err) {
      console.warn(`[pipeline] scoring history write failed: ${(err as Error).message}`)
    }
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
