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
import { runBriefGeneration, runBriefParsing } from './stages/0-brief-generation'
import { runResearch, runResearchSynthesis, extractResearchConstraints } from './stages/1-research'
import { runDecompose, runDecomposePA, runDecomposeRadical, isPhaseOneTreeOutputEnabled } from './stages/2-decompose'
import { runRegulatoryExtraction } from './stages/1b-regulatory'
import { runSizeLayout, runSizingSecondPass } from './stages/3-size-layout'
import { runBomCost } from './stages/4-bom-cost'
import { runSuppliers } from './stages/5-suppliers'
import { runBomCostSuppliers } from './stages/4-bom-cost-suppliers'
import { runReview } from './stages/6-review'
import { runFmeaGeneration } from './stages/6b-fmea-generation'
import PdfRenderer from './stages/7-pdf'
import PdfRendererV3 from './stages/7-pdf-v3'

// ── Phase H: runtime getters (F-9 fix) ───────────────────────────────────────
//
// H-B5 fix: isPaPipeline() and getPdfRenderer() are now imported from env.ts
// (single source of truth). The local definitions have been removed to prevent
// the two files from silently diverging.
//
// H-B6 fix: case-normalised opt-out ('False', 'FALSE', '0', 'no', 'off' all
// correctly opt out). See env.ts for full documentation.
//
// H-B4 fix: invalid PDF_RENDERER falls back to path-appropriate default
// ('v3' on PA path, 'v2' on legacy) — no longer hardcoded to 'v2'. See env.ts.
//
// H-B3 fix: TOCTOU — snapshots captured once at runPipeline() entry via
// `const paMode = isPaPipeline()` and `const renderer = getPdfRenderer()`
// and threaded through all branches. The module-level getters below remain
// available for generateErrorPdf() and getActivePdfRenderer() which are
// called outside runPipeline's closure.
import { isPaPipeline, getPdfRenderer } from './env'
import { isPhaseZeroSliceEnabled, runPhaseZeroSlice } from './radical/phase-0-slice/pipeline'

function getActivePdfRenderer(renderer: 'v2' | 'v3') {
  return renderer === 'v3' ? PdfRendererV3 : PdfRenderer
}
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
import { runBriefRevision } from './stages/3.5-brief-revision'
import { scoreSection, type SectionAudit } from './universal-scorer'
import { loadAllGroundingData } from './db-queries'
import type { PipelineState, StageResult, BriefConstraints, StructuredBriefJSON, ResearchSynthesis } from './types'
import { routeReportType, normaliseStatus, type ReportTypeRouterResult } from './report-type-router'
import { extractSpecs, summariseSpecs } from './lib/spec-extraction'
import { mapProductClassToIndustryDomain } from './lib/industry-domain'
import { validateModuleAssignments } from './lib/module-assignment-validator'
import { isPhase2ResolutionEnabled, runRadicalResolution } from './stages/4b-radical-resolution'

export interface EngineResult {
  ok: boolean
  state: PipelineState
  stages: Array<{ name: string; ok: boolean; durationMs: number; error?: string; skipped?: boolean; skipReason?: string }>
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
    const errorRenderer = getPdfRenderer()
    const doc = React.createElement(getActivePdfRenderer(errorRenderer), { state }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const base64 = buffer.toString('base64')
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: true, durationMs: pdfMs })
    console.log(`[pipeline] pdf (error path, renderer=${errorRenderer}): OK (${pdfMs}ms, ${Math.round(buffer.length / 1024)}KB)`)

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
 * BLOCKER-1 / BLOCKER-5 helper: build the PA synthetic DesignBrief from a
 * parsed brief object. Extracted so it can be called once at parse time and
 * re-merged after `state.research = researchResult.data` (BLOCKER-1), and so
 * the currency logic is in one place (BLOCKER-5).
 *
 * BLOCKER-5: if cost ceiling is USD or EUR, convert at a fixed conservative
 * rate and log a warning. This prevents silent drops — the scorer always has a
 * GBP figure to work with. Phase B will add multi-currency support properly.
 */
function _buildSyntheticDesignBrief(
  pb: StructuredBriefJSON,
  c: StructuredBriefJSON['constraints'],
) {
  let unitCostCeilingGbp: number | undefined
  if (c.unit_cost_ceiling?.value != null) {
    if (c.unit_cost_ceiling.currency === 'GBP') {
      unitCostCeilingGbp = c.unit_cost_ceiling.value
    } else if (c.unit_cost_ceiling.currency === 'USD') {
      // BLOCKER-5: approximate conversion — Phase B should use live rates
      unitCostCeilingGbp = Math.round(c.unit_cost_ceiling.value * 0.79)
      console.warn(
        `[pipeline] PA bridge: cost ceiling is USD ${c.unit_cost_ceiling.value} — ` +
        `converted to ~£${unitCostCeilingGbp} at 0.79 fixed rate. Phase B should use live rates.`
      )
    } else if (c.unit_cost_ceiling.currency === 'EUR') {
      // BLOCKER-5: approximate conversion
      unitCostCeilingGbp = Math.round(c.unit_cost_ceiling.value * 0.85)
      console.warn(
        `[pipeline] PA bridge: cost ceiling is EUR ${c.unit_cost_ceiling.value} — ` +
        `converted to ~£${unitCostCeilingGbp} at 0.85 fixed rate. Phase B should use live rates.`
      )
    }
  }

  return {
    useCase: pb.product_description || '',
    targetProcess: c.target_process?.value || '',
    targetMaterial: c.target_material?.value || '',
    toleranceTarget: '',
    quantityTarget: c.batch_size?.value != null ? String(c.batch_size.value) : '',
    complianceNotes: c.safety_standards?.map(s => s.standard).join(', ') || '',
    mission: pb.mission_statement,
    targetCustomers: pb.target_customers,
    whyNow: pb.why_now,
    constraints: {
      unitCostCeilingGbp,
      maxMassKg: c.max_mass_kg?.value ?? undefined,
      batchSize: c.batch_size?.value ?? undefined,
      operatingTemperature: (c.operating_environment?.temp_min_c != null && c.operating_environment?.temp_max_c != null)
        ? `${c.operating_environment.temp_min_c}°C to ${c.operating_environment.temp_max_c}°C`
        : undefined,
    } as BriefConstraints,
    regulatory: [],
    sources: [],
    competitors: [],
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
  // H-B8 fix: telemetry log is the very first executable line so it fires on
  // ALL code paths, including early-exit / exception paths.
  // H-B3 fix: snapshot paMode + renderer once at entry so every branch in this
  // invocation sees the same values even if process.env changes mid-run (Jest
  // parallel workers, test teardown).
  const paMode = isPaPipeline()
  const renderer = getPdfRenderer()
  console.info(`[pipeline] PA_PIPELINE=${paMode} PDF_RENDERER=${renderer}`)

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

  // ── Phase 0 Radical vertical slice (feature-flagged) ────────────────────────
  // When RADICAL_PHASE_0_SLICE=true AND the brief is for BESS, run the
  // Radical pipeline and attach the trace to the pipeline state.
  // The existing per-class pipeline still runs — this is strictly additive.
  // Runs BEFORE stage 1 so the trace is available for any stage that wants it.
  if (isPhaseZeroSliceEnabled()) {
    const isBessBrief = briefText.toLowerCase().includes('bess') ||
      briefText.toLowerCase().includes('battery energy storage') ||
      briefText.toLowerCase().includes('lfp')
    if (isBessBrief) {
      console.info('[pipeline] RADICAL_PHASE_0_SLICE=true + BESS brief detected — running Phase 0 slice')
      try {
        const sliceResult = await runPhaseZeroSlice()
        // Attach to state for observability — does NOT affect existing BoM/PDF output
        ;(state as any).radicalPhase0Slice = sliceResult
        console.info(
          `[pipeline] Phase 0 slice: ok=${sliceResult.ok} grammar=${sliceResult.grammar.verdict} ` +
          `cost=£${sliceResult.cost_rollup.system_total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ` +
          `nodes=${sliceResult.tree_node_count} leaves=${sliceResult.tree_leaf_count}`
        )
      } catch (sliceErr) {
        // Slice errors must NEVER affect the main pipeline
        console.error('[pipeline] Phase 0 slice threw unexpectedly:', (sliceErr as Error).message)
      }
    }
  }

  // B1 FIX (2026-05-09): stage source labels for AuditLogSection.
  // Maps stage name → human-readable source label used in the Duration column.
  const STAGE_SOURCE_MAP: Record<string, string> = {
    brief_parsing: 'Deterministic + LLM',
    training_data: 'LLM',
    research: 'LLM',
    brief_generation: 'LLM',
    size_layout: 'Deterministic',
    decompose: 'LLM',
    bom_cost: 'LLM + Deterministic',
    bom_cost_suppliers: 'LLM + Deterministic',
    suppliers: 'Corpus + API',
    regulatory_extraction: 'LLM',
    review: 'LLM',
    fmea_generation: 'LLM',
    council_scoring: 'LLM',
    pdf: 'Deterministic',
  }

  function trackStage(name: string, result: StageResult<unknown>) {
    stages.push({ name, ok: result.ok, durationMs: result.durationMs, error: result.error })
    // B1 FIX (2026-05-09): mirror each stage record to pipelineTrace so the
    // AuditLogSection can show real Duration values instead of always "—".
    // Previously trackStage only wrote to stages[] which was never connected to
    // the renderer's (state as any).pipelineTrace fallback path.
    if (!(state as any).pipelineTrace) (state as any).pipelineTrace = []
    ;(state as any).pipelineTrace.push({
      step: name,
      status: result.ok ? 'Complete' : 'BLOCKED',
      durationMs: result.durationMs,
      source: STAGE_SOURCE_MAP[name] || 'LLM',
      notes: result.error || `${name} stage complete`,
    })
    if (name !== 'pdf') llmCalls++
    console.log(`[pipeline] ${name}: ${result.ok ? 'OK' : 'FAILED'} (${result.durationMs}ms)${result.error ? ` — ${result.error}` : ''}`)
  }

  // BLOCKER-4 fix: emit a skip telemetry record so the dashboard shows
  // "skipped — superseded by PA Stage X" instead of "never ran" when a
  // legacy stage is gated off on the PA path.
  function trackSkippedStage(name: string, reason: string) {
    stages.push({ name, ok: true, durationMs: 0, skipped: true, skipReason: reason })
    console.log(`[pipeline] ${name}: SKIPPED — ${reason}`)
  }

  // A1 FIX (2026-05-06): gateResults must be function-scoped so the final
  // return statement can reference it on every code path (brief-invalid,
  // feasibility-RED, sizing-INFEASIBLE, and the happy path all end at the
  // single return block below). Previously declared inside a nested else,
  // which made it a ReferenceError at the PDF stage on every non-RED run.
  let gateResults: Array<{ gate: string; passed: boolean; findings: string[] }> = []

  // BLOCKER-1 fix: hoist syntheticDesignBrief so it survives the
  // `state.research = researchResult.data` overwrite at the Research stage.
  // After the overwrite we re-merge the PA constraints back in.
  let _paSyntheticDesignBrief: ReturnType<typeof _buildSyntheticDesignBrief> | null = null

  // ── PA Stage 1: Brief Parsing (PA_PIPELINE=true only) ────────────────
  // Runs BEFORE Classification. Produces state.parsedBrief (StructuredBriefJSON).
  // On PA_PIPELINE=false this block is skipped entirely — existing pipeline unchanged.
  if (paMode) {
    console.log('\n[pipeline] === PA Stage 1: Brief Parsing ===')
    const briefParseResult = await runBriefParsing(briefText)
    trackStage('brief_parsing', briefParseResult)

    if (briefParseResult.ok && briefParseResult.data) {
      state.parsedBrief = briefParseResult.data
      console.log(`[pipeline] PA Brief parsed: confidence=${briefParseResult.data.confidence}, missing=${briefParseResult.data.missing_mandatory_fields.length} fields`)

      // Backwards-compat bridge: synthesise state.research.designBrief from
      // parsedBrief.constraints so downstream stages that read designBrief
      // keep working without modification (Phase B will update them properly).
      const pb = briefParseResult.data
      const c = pb.constraints
      const syntheticDesignBrief = _buildSyntheticDesignBrief(pb, c)

      // Keep a reference for re-merging after the Research overwrite (BLOCKER-1).
      _paSyntheticDesignBrief = syntheticDesignBrief

      // Initialise state.research if not yet set, so the designBrief bridge works
      if (!state.research) {
        state.research = {
          report: '',
          sources: [],
          designBrief: syntheticDesignBrief,
        }
      } else {
        state.research.designBrief = syntheticDesignBrief
      }
    } else {
      console.warn(`[pipeline] PA Brief Parsing failed: ${briefParseResult.error}. Continuing without parsedBrief.`)
      // Non-fatal on PA path — downstream stages fall back to legacy behaviour
    }
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
  // On PA path, pass parsedBrief so validateBrief uses missing_mandatory_fields
  const briefValidation = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields, paMode ? state.parsedBrief : null)
  
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

  // ── Stage 1: Training Data Knowledge Dump ──────────────────────────
  // Phase C: gated off on PA_PIPELINE=true. The PA Stage 3 Research Synthesis
  // receives the structured brief (PA Stage 1 output) and is expected to generate
  // market context from its own parametric knowledge — the Training Data Dump is
  // therefore redundant on the PA path. The dossier remains available on the
  // legacy path (PA_PIPELINE=false) for backwards compatibility.
  let trainingDossier: string | undefined
  if (!paMode) {
    console.log('\n[pipeline] === Stage 1: Training Data Dump ===')
    try {
      const stage1Result = await runTrainingDataDump(briefText)
      trackStage('training_data', stage1Result)
      if (stage1Result.ok && stage1Result.data) {
        trainingDossier = (stage1Result.data as any).dossier
      }
    } catch (err) {
      console.log('[pipeline] Training data failed, continuing without dossier:', (err as Error).message)
    }
  } else {
    // BLOCKER-4 fix: emit skip record so dashboard shows "skipped — superseded by PA Stage 1+3"
    // rather than "never ran". PA Stage 1 (Brief Parsing) + PA Stage 3 (Research Synthesis)
    // together replace the Training Data Dump on the PA path.
    trackSkippedStage('training_data', 'superseded by PA Stage 1 (Brief Parsing) + PA Stage 3 (Research Synthesis)')
  }

  // BLOCKER-3 fix: if PA path but Brief Parsing failed to populate
  // state.parsedBrief, do NOT silently fall through to the legacy pipeline.
  // Falling through creates an undocumented hybrid state where PA stage 1
  // ran but legacy runDecompose receives undefined dossier — producing bad
  // output with no clear failure signal.  Fail fast instead.
  if (paMode && !state.parsedBrief) {
    throw new Error(
      'PA_PIPELINE=true but Brief Parsing failed to populate state.parsedBrief — ' +
      'pipeline cannot continue safely. Check Brief Parsing stage logs for the root cause.'
    )
  }

  // ── Stage 2: Research ─────────────────────────────────────────────────
  // Phase B: on PA path, use runResearchSynthesis() (PA Stage 3).
  // On legacy path (PA_PIPELINE=false), use the legacy runResearch() — unchanged.
  console.log('\n[pipeline] === Stage 2: Research ===')

  if (paMode && state.parsedBrief) {
    // ── PA path: runResearchSynthesis consumes StructuredBriefJSON ────────
    console.log('[pipeline] PA path: running PA Stage 3 Research Synthesis...')
    const synthResult = await runResearchSynthesis(state.parsedBrief, classification.productClass)
    trackStage('research', synthResult)

    if (!synthResult.ok || !synthResult.data) {
      state.pipelineError = {
        stage: 'research',
        message: synthResult.error || 'PA Research Synthesis returned no data',
        occurredAt: new Date().toISOString(),
        recoverable: false,
      }
      console.error(`[pipeline] PA Research Synthesis failed: ${synthResult.error}. Producing error PDF.`)
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

    // Store the typed PA output on state
    state.researchSynthesis = synthResult.data

    // ── Dual-write: synthesise legacy state.research shape for backwards compat ──
    // Downstream stages (Decompose, Sizing, BOM, etc.) read state.research.report
    // and state.research.designBrief. They are NOT modified in Phase B.
    // The PA constraints from parsedBrief (already in _paSyntheticDesignBrief)
    // are the authoritative source; we merge the new synthesis narrative on top.
    const synthesis = synthResult.data
    const legacyReport =
      synthesis.market_context + '\n\n' + synthesis.why_now

    const legacyCompetitors = synthesis.competitors.map(c => ({
      name: c.company,
      product: c.product,
      technicalSpecs: c.key_specs,
      pricing: c.pricing,
      strengths: c.strengths.join('; '),
      weaknesses: c.weaknesses.join('; '),
      differentiationAngle: c.differentiation_angle,
    }))

    // Preserve the designBrief built from parsedBrief (BLOCKER-1 guard)
    const preservedDesignBrief = _paSyntheticDesignBrief
      ? { ..._paSyntheticDesignBrief, competitors: legacyCompetitors }
      : { competitors: legacyCompetitors }

    // BLOCKER-1 fix: populate industryDomain on the PA dual-write so all 5
    // downstream read-sites (`options?.domain || state.research.industryDomain`)
    // receive a non-undefined value on the PA path. Derived from the
    // deterministic productClass (Phase A classification step runs BEFORE
    // Research on the PA path), using the same vocabulary as runResearch().
    state.research = {
      report: legacyReport,
      // E FIX (2026-05-09): propagate all rich fields from ResearchSource to the
      // legacy sources[] shape so BriefPages Research Sources table can render
      // type, sourceGrade, and relevance instead of [?] for every row.
      // Previously only title was mapped, leaving type/sourceGrade/relevance undefined.
      sources: synthesis.research_sources.map(s => ({
        uri: '',
        title: s.title,
        type: s.type,
        sourceGrade: s.source_grade,
        relevance: s.relevance,
      })),
      designBrief: preservedDesignBrief as any,
      industryDomain: mapProductClassToIndustryDomain(classification.productClass),
    }

    console.log(
      `[pipeline] PA Research Synthesis complete: ${synthesis.competitors.length} competitors, ` +
      `${synthesis.claims_requiring_verification.length} claims flagged. ` +
      `Dual-wrote to state.research for downstream compat.`
    )

    // Phase B: constraints already in parsedBrief — skip extractResearchConstraints().
    // The constraints are in state.parsedBrief.constraints; legacy extractResearchConstraints
    // (which calls the LLM again) is not needed on the PA path.
    // Populate a minimal researchConstraints from parsedBrief for downstream safety.
    const pb = state.parsedBrief
    state.researchConstraints = {
      benchmarkPrices: [],
      materialCosts: [],
      regulatoryCosts: [],
      competitorSpecs: synthesis.competitors.map(c => ({
        name: c.company,
        mass: undefined as unknown as number,
        cost: undefined as unknown as number,
        keySpecs: [c.key_specs].filter(Boolean),
      })),
    }
    console.log('[pipeline] PA path: skipped extractResearchConstraints() — constraints from parsedBrief')

  } else {
    // ── Legacy path: runResearch() unchanged ─────────────────────────────
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

    // BLOCKER-1 fix: runResearch() overwrites state.research entirely, destroying
    // the syntheticDesignBrief the PA bridge wrote at Stage 1.  Re-merge the PA
    // constraints now so Decompose/Sizing/BOM/Cost all see the parsed brief data.
    if (_paSyntheticDesignBrief) {
      state.research.designBrief = {
        ...state.research.designBrief,
        ...(_paSyntheticDesignBrief as any),
        // Merge constraints: research may have added fields, PA constraints are authoritative
        constraints: {
          ...state.research.designBrief?.constraints,
          ..._paSyntheticDesignBrief.constraints,
        },
      }
      console.log('[pipeline] PA bridge: re-merged syntheticDesignBrief into state.research after Research overwrite')
    }

    // Extract constraints for downstream stages (legacy path only)
    const constraintsResult = await extractResearchConstraints(
      state.research.report,
      JSON.stringify(state.research.designBrief || {})
    )
    state.researchConstraints = constraintsResult
    console.log(`[pipeline] Extracted research constraints: ${constraintsResult.benchmarkPrices.length} benchmarks, ${constraintsResult.materialCosts.length} materials, ${constraintsResult.regulatoryCosts.length} regs, ${constraintsResult.competitorSpecs.length} competitors`)
  }

  // ── Stage 3: Brief Generation (legacy path only) ─────────────────────
  // NOTED-3 fix: on PA path the parsedBrief already holds all
  // structured constraints.  runBriefGeneration() adds a second LLM call
  // and would overwrite designBrief with research-informed — but not PA-
  // informed — data. Gate it off so the PA path only uses the new parser.
  // Phase B will remove this stage from the PA path entirely.
  if (!paMode) {
  console.log('\n[pipeline] === Stage 3: Brief Generation ===')
  const briefGenResult = await runBriefGeneration(briefText, classification.productClass)
  trackStage('brief_generation', briefGenResult)
  if (briefGenResult.ok && briefGenResult.data) {
    state.generatedBrief = briefGenResult.data
    console.log(`[pipeline] Brief generated: ${briefGenResult.data.briefText.length} chars, ${briefGenResult.data.fields.objectives.length} objectives`)
    
    // SYNC: Brief fields become the source of truth for downstream stages.
    // Overwrite designBrief with the Brief's structured interpretation so that
    // Feasibility, Decompose, BOM, Cost, Suppliers all use the "good brief" data.
    if (state.research) {
      const bf = briefGenResult.data.fields
      const existing = state.research.designBrief
      const mergedConstraints: BriefConstraints = {
        ...existing?.constraints,
        unitCostCeilingGbp: bf.costCeiling ?? existing?.constraints?.unitCostCeilingGbp,
        maxMassKg: bf.maxMass ?? existing?.constraints?.maxMassKg,
        batchSize: bf.productionVolume || existing?.constraints?.batchSize,
        jurisdiction: bf.jurisdiction || existing?.constraints?.jurisdiction,
        envelope: bf.envelope || existing?.constraints?.envelope,
        operatingTemperature: bf.operatingTemp || existing?.constraints?.operatingTemperature,
      }
      state.research.designBrief = {
        useCase: bf.objectives?.join('. ') || existing?.useCase || '',
        targetProcess: bf.requirements?.find(r => r.toLowerCase().includes('process')) || existing?.targetProcess || '',
        targetMaterial: bf.requirements?.find(r => r.toLowerCase().includes('material')) || existing?.targetMaterial || '',
        toleranceTarget: bf.requirements?.find(r => r.toLowerCase().includes('tolerance')) || existing?.toleranceTarget || '',
        quantityTarget: bf.productionVolume || existing?.quantityTarget || '',
        complianceNotes: existing?.complianceNotes || '',
        mission: bf.purpose || existing?.mission,
        targetCustomers: existing?.targetCustomers,
        whyNow: existing?.whyNow,
        constraints: mergedConstraints,
        regulatory: existing?.regulatory,
        sources: existing?.sources,
        competitors: existing?.competitors,
      }
      console.log(`[pipeline] Brief fields synced to designBrief: cost=£${bf.costCeiling || '?'}, mass=${bf.maxMass || '?'}kg, volume=${bf.productionVolume || '?'}`)
    }
  } else {
    console.warn('[pipeline] Brief generation failed, using raw text:', briefGenResult.error)
  }
  } else {
    // BLOCKER-4 fix: emit skip record so dashboard shows "skipped — superseded by PA Stage 1"
    // rather than "never ran". PA Stage 1 (Brief Parsing) produces all structured constraints;
    // the legacy Brief Generation LLM call is redundant on the PA path.
    trackSkippedStage('brief_generation', 'superseded by PA Stage 1 (Brief Parsing)')
  } // end if (!paMode) — Brief Generation stage

  state.sourceAttributions.push(
    { section: 'Research', source: 'llm', detail: 'MiMo V2.5-Pro via OpenRouter' },
    { section: 'Research', source: 'user', detail: 'Founder brief text' },
    { section: 'Regulatory', source: 'llm', detail: 'MiMo V2.5-Pro — standards extraction' },
  )
  state.llmAttributions.push(
    { section: 'Research', model: 'xiaomi/mimo-v2.5-pro', provider: 'OpenRouter' },
  )

  // ── Product Specs Extraction (deterministic) ───────────────────────
  // Per-cell qty realism (2026-05-06): pull canonical specs out of the
  // brief + DesignBrief now that both are available. The BOM stage will
  // use these to override LLM-guessed quantities.
  const productSpecs = extractSpecs(briefText, state.research?.designBrief || null)
  ;(state as any).productSpecs = productSpecs
  console.log(`[pipeline] Product specs extracted: ${summariseSpecs(productSpecs)}`)

  // ── Brief Validation (post-research, now we have designBrief) ──────
  // On PA path, parsedBrief is the authoritative source; designBrief is already synced from it.
  const briefValidationPost = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields, paMode ? state.parsedBrief : null)
  
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
  // ─────────────────────────────────────────────────────────────────────────
  // REORDER 2026-05-09: align pipeline order with PDF render order
  //
  // Architecturally-correct execution order (PA path):
  //   Sizing → Feasibility Gate → Brief Revision loop (if FAIL/WARN)
  //   → Router → PA Stage 5 Decompose → BOM/Cost/Assembly
  //   → PA Stage 4 Regulatory (AFTER BOM, references real materials)
  //   → Review → Council Scoring → PDF
  //
  // Rationale:
  //   1. Sizing runs BEFORE the Feasibility Gate so the gate sees the solver verdict.
  //   2. The Brief Revision loop fires AFTER the Gate; Decompose is expensive and
  //      should NOT run if the brief needs revising first.
  //   3. Regulatory runs AFTER BOM so it can reference real materials/processes
  //      rather than brief-level guesses.
  // ─────────────────────────────────────────────────────────────────────────

  // BENCH-L1: stamp productClass on state so the PDF renderer can do
  // benchmark lookups without re-classifying.
  state.productClass = classification.productClass

  // ── Stage 3: Size + Layout ─────────────────────────────────────────
  // Runs BEFORE Feasibility Gate so the gate sees the actual solver verdict.
  // On the PA path, state.modules is empty at this point (Decompose runs after
  // the gate). The solver uses domain-derived envelopes and brief constraints;
  // the module-level placement detail is filled in after Decompose runs.
  console.log('\n[pipeline] === Stage 3: Size + Layout ===')
  // Precedence: brief-stated dimensions ALWAYS win; class default is the fallback
  // when brief omits geometry. See V7 council 1e4adaf2 for the regression.
  const _briefDims = state.parsedBrief?.constraints?.max_dimensions_mm
  const _briefEnvelope =
    _briefDims && _briefDims.w != null && _briefDims.d != null && _briefDims.h != null
      ? { w_mm: _briefDims.w, d_mm: _briefDims.d, h_mm: _briefDims.h }
      : undefined
  if (_briefEnvelope) {
    console.log(`[pipeline] Brief-stated envelope found: ${_briefEnvelope.w_mm}×${_briefEnvelope.d_mm}×${_briefEnvelope.h_mm} mm — will override class default in sizing solver`)
  }
  const sizeResult = await runSizeLayout(state.modules, {
    domain: options?.domain || state.research.industryDomain,
    paMode,
    briefEnvelope: _briefEnvelope,
  })
  trackStage('size_layout', sizeResult)
  if (sizeResult.ok && sizeResult.data) {
    state.dimensionSheet = sizeResult.data
  }
  // Continue even if sizing fails (infeasible is a valid outcome — Gate will catch it)

  // Real sizing verdict for the Feasibility Gate (no longer a null placeholder).
  const sizingResult = {
    feasible: (sizeResult.ok && sizeResult.data) ? (sizeResult.data.feasible ?? null) : null,
  }

  // ── Feasibility Gate ───────────────────────────────────────────────
  // Runs AFTER Sizing so it incorporates the real solver verdict.
  // If gate FAILS/WARNS → Brief Revision loop fires (max 2 iterations).
  console.log('\n[pipeline] === Feasibility Gate ===')
  const feasibility = determineFeasibility(
    briefValidationPost,
    sizingResult,
    null,  // cost not yet computed
    classification.productClass,
  )
  ;(state as any).feasibility = feasibility
  console.log(`[pipeline] Feasibility: ${feasibility.status} — ${feasibility.reason}`)
  console.log(`[pipeline] Allowed sections: ${feasibility.allowedSections.join(', ')}`)

  // ── Feasibility → Brief Feedback Loop ───────────────────────────────
  // Fires AFTER Feasibility Gate when it FAILS/WARNS. Max 2 iterations.
  // On PA path, only runs when the preliminary route is FEASIBILITY_EXCEPTION.
  const MAX_REVISIONS = 2
  let revisionCount = 0
  const rejectedConstraints: string[] = []

  // PA path: compute preliminary route to decide whether to run the revision loop.
  // This is a cheap deterministic call (no LLM) — the final authoritative route
  // runs after the loop below.
  const _prelimRoute = paMode ? routeReportType(feasibility, state.parsedBrief) : null
  const _paRevisionEnabled = !paMode || _prelimRoute?.reportType === 'FEASIBILITY_EXCEPTION'

  // F-10 fix (2 seats): use normalised status in loop condition so PA-native
  // FAIL/WARN statuses are handled identically to legacy RED/AMBER.
  // Previously the loop checked raw status strings, so PA-native `FAIL`/`WARN`
  // never triggered revisions even when the router treated them as failure/warning.
  while (
    _paRevisionEnabled &&
    (normaliseStatus(feasibility.status) === 'FAIL' || normaliseStatus(feasibility.status) === 'WARN') &&
    revisionCount < MAX_REVISIONS
  ) {
    revisionCount++
    console.log(`\n[pipeline] === Brief Revision ${revisionCount}/${MAX_REVISIONS} (Feasibility: ${feasibility.status}) ===`)

    const feasText = feasibility.reason || feasibility.blockers?.join('; ') || 'Infeasible constraints found'

    const revisionResult = await runBriefRevision(
      briefText,
      state.generatedBrief?.briefText || briefText,
      feasText,
      classification.productClass,
    )

    if (revisionResult.ok && revisionResult.data?.hasRevisions) {
      const rev = revisionResult.data
      console.log(`[pipeline] Brief revised: ${rev.changes.length} constraints updated`)

      // Log what changed
      for (const change of rev.changes) {
        console.log(`[pipeline]   ${change.constraint}: ${change.original} → ${change.revised} (${change.reasoning})`)
        rejectedConstraints.push(`${change.constraint}: ${change.original}`)
      }

      // Update the Brief's constraint VALUES (not text)
      if (state.generatedBrief?.fields) {
        for (const change of rev.changes) {
          const field = change.constraint.toLowerCase()
          if (field.includes('cost') || field.includes('price')) {
            const match = change.revised.match(/[\d,]+/)
            if (match) state.generatedBrief.fields.costCeiling = parseInt(match[0].replace(/,/g, ''))
          } else if (field.includes('mass') || field.includes('weight')) {
            const match = change.revised.match(/[\d,.]+/)
            if (match) state.generatedBrief.fields.maxMass = parseFloat(match[0].replace(/,/g, ''))
          } else if (field.includes('volume') || field.includes('production')) {
            state.generatedBrief.fields.productionVolume = change.revised
          }
        }
      }

      // Sync revised constraints back to designBrief
      if (state.research?.designBrief && state.generatedBrief?.fields) {
        const bf = state.generatedBrief.fields
        state.research.designBrief.constraints = {
          ...state.research.designBrief.constraints,
          unitCostCeilingGbp: bf.costCeiling ?? state.research.designBrief.constraints?.unitCostCeilingGbp,
          maxMassKg: bf.maxMass ?? state.research.designBrief.constraints?.maxMassKg,
        }
      }

      // Store revision on state for PDF rendering
      ;(state as any).briefRevisions = [...((state as any).briefRevisions || []), rev]

      // BLOCKER-3 fix: on PA path, re-parse the revised brief text so
      // state.parsedBrief reflects the revision.  validateBrief reads
      // missing_mandatory_fields from parsedBrief — without this update the
      // PA validator keeps seeing the stale pre-revision missing fields.
      if (paMode) {
        const revisedBriefText = state.generatedBrief?.briefText || briefText
        const reparseResult = await runBriefParsing(revisedBriefText)
        if (reparseResult.ok && reparseResult.data) {
          state.parsedBrief = reparseResult.data
          console.log(`[pipeline] PA: re-parsed brief after revision ${revisionCount} — missing=${reparseResult.data.missing_mandatory_fields.length}`)
        } else {
          console.warn(`[pipeline] PA: re-parse after revision ${revisionCount} failed: ${reparseResult.error}. Using stale parsedBrief.`)
        }
      }

      // Re-run Feasibility with updated constraints (sizing result unchanged)
      const newBriefValidation = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields, paMode ? state.parsedBrief : null)
      const newFeasibility = determineFeasibility(newBriefValidation, sizingResult, null, classification.productClass)

      // Update feasibility
      Object.assign(feasibility, newFeasibility)
      ;(state as any).feasibility = feasibility
      console.log(`[pipeline] Feasibility after revision ${revisionCount}: ${feasibility.status}`)

      // F-12 fix (3 seats): re-evaluate route inside the loop after each revision.
      // If revision improved feasibility from FAIL+2 → WARN+1 (route is now
      // FULL_REPORT), break immediately rather than running a wasted 2nd iteration.
      // Previously _paRevisionEnabled was pre-computed once from the preliminary
      // route and never updated, so the loop always ran to MAX_REVISIONS even after
      // the route resolved.
      if (paMode) {
        const midLoopRoute = routeReportType(feasibility, state.parsedBrief)
        if (midLoopRoute.reportType !== 'FEASIBILITY_EXCEPTION') {
          console.log(`[pipeline] PA: route resolved to ${midLoopRoute.reportType} after revision ${revisionCount} — breaking loop early`)
          break
        }
      }
    } else {
      console.log('[pipeline] No revisions proposed — breaking loop')
      break
    }
  }

  // Log final state
  if (revisionCount > 0) {
    console.log(`\n[pipeline] Brief revision complete: ${revisionCount} iterations, ${rejectedConstraints.length} constraints revised`)
    console.log(`[pipeline] Rejected constraints: ${rejectedConstraints.join(', ')}`)
  }

  // ── PA Stage 9: Report Type Router (PA_PIPELINE=true only) ───────────────
  // Runs after the feasibility gate (and any revision loop) to determine the
  // report type and page budget. On PA_PIPELINE=false this block is skipped
  // entirely — downstream behaviour is unchanged on the legacy path.
  let _paRouterResult: ReportTypeRouterResult | null = null
  if (paMode) {
    _paRouterResult = routeReportType(feasibility, state.parsedBrief)
    state.reportType = _paRouterResult.reportType
    // F-8 fix (4 seats): `reportTypeRouterResult` is now a typed field on PipelineState
    // (added to types.ts). `(feasibility as any).reportType` cast removed — feasibility
    // is still a FeasibilityResult (which already has `reportType?: ReportType` from
    // feasibility-gate.ts Phase F addition), so direct assignment is safe.
    feasibility.reportType = _paRouterResult.reportType
    state.reportTypeRouterResult = _paRouterResult
    console.log(
      `[pipeline] PA Stage 9 Router: ${_paRouterResult.reportType} ` +
      `(maxPages=${_paRouterResult.maxPages}, excluded=${_paRouterResult.excludedSections.length} sections) — ${_paRouterResult.reason}`
    )
  }

  // gateResults declared at function scope (see A1 fix above). Reset here.
  gateResults = []

  // If RED (or sizing INFEASIBLE which now folds into RED via sizingResult above),
  // skip Decompose, BOM, Regulatory, and all downstream stages — go straight to
  // a short blocked report. Decompose now runs inside the non-RED else branch so
  // we never waste LLM tokens if the brief is infeasible.
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
    // Skip: Decompose, BOM, Regulatory, cost, assembly, review — go straight to PDF with decision page
  } else {
    // ── Stage 2: Decompose ─────────────────────────────────────────────
    // Runs AFTER the Feasibility Gate (and any Brief Revision loop) so we only
    // spend LLM tokens on module decomposition once the brief is confirmed feasible.
    //
    // Phase D1: on PA path, use runDecomposePA() (PA Stage 5 schema).
    // On legacy path (PA_PIPELINE=false), use the legacy runDecompose() — unchanged.
    // Note: state.regulatoryExtraction is NOT yet populated at this point (Regulatory
    // runs AFTER BOM per the corrected pipeline order). runDecomposePA receives
    // undefined for the regulatory parameter — it handles this gracefully (optional arg).
    console.log('\n[pipeline] === Stage 2: Decompose ===')

    let decomposeResult: Awaited<ReturnType<typeof runDecompose>>

    if (paMode && state.parsedBrief) {
      // ── PA path: runDecomposePA uses PA Stage 5 prompt + schema ───────────
      console.log('[pipeline] PA path: running PA Stage 5 Module Decomposition...')

      // D1 council BLOCKER-D1-7 fix (2/6 seats: GPT-5.4, MiMo):
      // classification.productClass accessed directly — if classification were passed
      // as a plain string at the orchestrator level (which regulatory extraction
      // code explicitly anticipates), .productClass would be undefined, propagating
      // "undefined" as a string to the LLM prompt. Use a shared helper to extract
      // the product class string safely from either form.
      const productClassStr: string = typeof classification === 'string'
        ? classification
        : (classification.productClass ?? 'UNKNOWN')

      // state.regulatoryExtraction is undefined here — Regulatory runs AFTER BOM.
      // runDecomposePA accepts it as optional; passing undefined is intentional.
      const paResult = await runDecomposePA(
        state.parsedBrief,
        productClassStr,
        undefined,  // regulatory not yet available — runs after BOM per corrected order
      )

      // D1 council BLOCKER-D1-9 fix (3/6 seats: GLM-5.1, Kimi, MiMo):
      // The previous cast `paResult as typeof decomposeResult` suppressed structural
      // divergence. If paResult.ok === false, the error shape was cast and then
      // silently processed. Use explicit narrowing instead so each branch is typed
      // and the ok/error/data shapes are correct for the downstream error handler.
      if (!paResult.ok) {
        decomposeResult = { ok: false, error: paResult.error, durationMs: paResult.durationMs }
      } else {
        // ModulePA structurally extends Module — the cast is intentional and the
        // comment below documents this assumption explicitly (unlike the original
        // cast which was silent). The PA data carries all Module fields plus extras.
        decomposeResult = {
          ok: true,
          // ModulePA is a structural superset of Module — safe to widen.
          data: paResult.data as unknown as import('./types').Module[],
          durationMs: paResult.durationMs,
        }
      }
    } else {
      // ── Legacy path: unchanged ────────────────────────────────────────────
      decomposeResult = await runDecompose(state.research, {
        trainingDataDossier: trainingDossier || options?.trainingDataDossier,
      })
    }

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

    // ── Radical Phase 1: tree emission (BESS only, behind feature flag) ────
    // When RADICAL_PHASE_1_TREE_OUTPUT=true AND paMode is active, run the
    // Radical decompose in parallel with the normal flat-list output.
    // This is STRICTLY ADDITIVE — state.modules is unchanged.
    // The tree is written to state.radicalTree + state.radicalTreeUnknowns.
    // Unknown radicals are surfaced to console but do NOT block the pipeline.
    if (paMode && state.parsedBrief && isPhaseOneTreeOutputEnabled()) {
      console.log('[pipeline] Radical Phase 1: RADICAL_PHASE_1_TREE_OUTPUT=true, running tree decomposition...')
      try {
        const productClassForRadical: string = typeof classification === 'string'
          ? classification
          : ((classification as any).productClass ?? 'UNKNOWN')
        const radicalResult = await runDecomposeRadical(
          state.parsedBrief,
          productClassForRadical,
          state.regulatoryExtraction,
        )
        if (radicalResult.ok && radicalResult.data) {
          state.radicalTree = radicalResult.data.tree
          state.radicalTreeUnknowns = radicalResult.data.unknowns
          console.log(
            `[pipeline] Radical Phase 1: tree emitted. Unknowns: ${radicalResult.data.unknowns.length}` +
            (radicalResult.data.unknowns.length > 0
              ? ` — SURFACE TO TRISTAN: ${radicalResult.data.unknowns.join(', ')}`
              : '')
          )
          if (radicalResult.data.netNewArchetypes.length > 0) {
            console.warn(`[pipeline] Radical Phase 1: net-new archetypes (not in library): ${radicalResult.data.netNewArchetypes.join(', ')}`)
          }

          // Phase 1 + Phase 0 integration: if both flags are set, re-run the
          // vertical slice with the LLM-emitted tree so the grammar + cost
          // rollup paths run against real LLM output (not the hardcoded tree).
          if (isPhaseZeroSliceEnabled() && state.radicalTree) {
            console.log('[pipeline] Radical Phase 1+0 integration: re-running vertical slice with LLM-emitted tree...')
            try {
              const p1SliceResult = await runPhaseZeroSlice(state.radicalTree)
              ;(state as any).radicalPhase1Slice = p1SliceResult
              console.log(
                `[pipeline] Phase 1+0 slice: ok=${p1SliceResult.ok} source=${p1SliceResult.tree_source} ` +
                `grammar=${p1SliceResult.grammar.verdict} ` +
                `cost=£${p1SliceResult.cost_rollup.system_total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })} ` +
                `nodes=${p1SliceResult.tree_node_count} leaves=${p1SliceResult.tree_leaf_count}`
              )
            } catch (p1SliceErr) {
              console.warn(`[pipeline] Phase 1+0 slice threw (non-fatal): ${(p1SliceErr as Error).message}`)
            }
          }
        } else {
          console.warn(`[pipeline] Radical Phase 1: tree decomposition failed (non-fatal): ${radicalResult.error}`)
        }
      } catch (radicalErr) {
        // Non-fatal — Radical Phase 1 failure must NEVER block the main pipeline
        console.warn(`[pipeline] Radical Phase 1: exception (non-fatal): ${(radicalErr as Error).message}`)
      }
    }

    // ── Radical Phase 2: Resolution (behind RADICAL_PHASE_2_RESOLUTION flag) ─
    // Walks state.radicalTree leaves and resolves each to: mpn, manufacturer,
    // unit_price_gbp, lead_weeks, verification_grade, source.
    // Strictly additive — state.modules / state.bomLines are UNCHANGED.
    // Requires Phase 1 tree (state.radicalTree) to be populated first.
    if (isPhase2ResolutionEnabled() && state.radicalTree) {
      console.log('[pipeline] Radical Phase 2: RADICAL_PHASE_2_RESOLUTION=true, running resolution...')
      try {
        const productClassForResolution: string = typeof classification === 'string'
          ? classification
          : ((classification as any).productClass ?? 'unknown')
        const resolvedTree = await runRadicalResolution(state.radicalTree, productClassForResolution)
        state.resolvedRadicalTree = resolvedTree
        const rMeta = resolvedTree.resolution_meta
        console.log(
          `[pipeline] Radical Phase 2: resolution complete. ` +
          `Verified: ${rMeta.stats.verified_by_distributor}, ` +
          `Catalog: ${rMeta.stats.from_vendor_catalog}, ` +
          `Grade-D: ${rMeta.stats.grade_d}, Stub: ${rMeta.stats.stub}, ` +
          `API calls: ${rMeta.distributor_calls_made}`
        )
      } catch (phase2Err) {
        // Non-fatal — Phase 2 failure must NEVER block the main pipeline
        console.warn(`[pipeline] Radical Phase 2: exception (non-fatal): ${(phase2Err as Error).message}`)
      }
    } else if (isPhase2ResolutionEnabled() && !state.radicalTree) {
      console.warn('[pipeline] Radical Phase 2: RADICAL_PHASE_2_RESOLUTION=true but state.radicalTree is absent — Phase 1 must run first')
    }

    // ── Module Assignment Plausibility Validation (UNIVERSAL-ROBUSTNESS) ──
    // UNIVERSAL-ROBUSTNESS FIX (2026-05-10): deterministic check that each
    // part belongs to a module that makes physical sense. Catches:
    //   - HVAC Fan Coil in Structural Frame (vfarm) → should be HVAC Module
    //   - BMS in ISO Container Module (BESS) → should be Battery Subsystem
    // Warnings are surfaced to console and stored on state for PDF audit log.
    // Non-fatal — never blocks the pipeline.
    try {
      const assignmentResult = validateModuleAssignments(state.modules)
      if (assignmentResult.warningCount > 0) {
        console.warn(`[pipeline] Module assignment: ${assignmentResult.warningCount} plausibility warnings (${assignmentResult.checkedCount} parts checked)`)
        for (const w of assignmentResult.warnings) {
          console.warn(`[pipeline]   MISASSIGNED: "${w.partName}" in "${w.moduleName}" (${w.partCategory}) → ${w.suggestedModule}`)
        }
        // Store for PDF audit log and downstream stages
        ;(state as any).moduleAssignmentWarnings = assignmentResult.warnings
      } else {
        console.log(`[pipeline] Module assignment: all ${assignmentResult.checkedCount} parts plausibly assigned`)
      }
    } catch (assignErr) {
      console.warn(`[pipeline] Module assignment validator failed (non-fatal): ${(assignErr as Error).message}`)
    }

    // ── Sizing Second Pass ─────────────────────────────────────────────────
    // The first sizing pass (Stage 3, above) ran on empty modules so that the
    // Feasibility Gate could see the envelope verdict before spending LLM tokens
    // on Decompose.  Now that modules are populated, re-derive zone allocation,
    // volume/mass utilisation, and mass budget from the real module list.
    //
    // runSizingSecondPass is a pure deterministic function (<5 ms) — no LLM,
    // no network, no separate stage entry in `stages`.  It merges the correct
    // envelope constants from the first-pass sheet with the newly computed
    // per-module dimensions and zone groupings.
    if (paMode && state.dimensionSheet) {
      console.log('[pipeline] Sizing second pass: re-computing zone allocation from real modules')
      try {
        const secondPassSheet = runSizingSecondPass(state.dimensionSheet, state.modules)
        state.dimensionSheet = secondPassSheet
        console.log(`[pipeline] Sizing second pass OK: ${secondPassSheet.zones?.length ?? 0} zones, ` +
          `vol=${secondPassSheet.volumeUtilisationPct ?? '—'}%, mass=${secondPassSheet.massUtilisationPct ?? '—'}%`)
      } catch (secondPassErr) {
        // Non-fatal: keep the first-pass sheet rather than crashing the pipeline.
        console.warn(`[pipeline] Sizing second pass failed (non-fatal): ${(secondPassErr as Error).message}`)
      }
    }

    state.sourceAttributions.push(
      { section: 'Modules', source: 'llm', detail: 'Gemini 3.1 Pro — module decomposition' },
    )
    state.llmAttributions.push(
      { section: 'Decompose', model: 'google/gemini-3.1-pro-preview', provider: 'OpenRouter' },
    )

    // ── Stage 4: BOM + Cost (+ Suppliers when BOM_PIPELINE=v2) ───────────
  // Feature flag: BOM_PIPELINE=v2 routes to the integrated stage (4-bom-cost-suppliers.ts).
  // Default (v1) keeps the existing 3-stage flow: 4-bom-cost → gate → 5-suppliers.
  // Both must work; the integrated stage does NOT replace old stages until cut-over.
  const USE_INTEGRATED_BOM = process.env.BOM_PIPELINE === 'v2'
  console.log(`\n[pipeline] === Stage 4: BOM + Cost${USE_INTEGRATED_BOM ? ' + Suppliers (v2 integrated)' : ''} ===`)

  if (USE_INTEGRATED_BOM) {
    // ── v2: integrated BOM / Cost / Suppliers stage ────────────────────
    const integratedResult = await runBomCostSuppliers({
      modules: state.modules,
      designBrief: state.research?.designBrief ?? null,
      classification,
      grounding: groundingData ?? undefined,
      productSpecs,
      domain: options?.domain || state.research.industryDomain,
      ceilingGbp: options?.ceilingGbp,
      trainingDataDossier: trainingDossier || options?.trainingDataDossier,
    })
    trackStage('bom_cost_suppliers', integratedResult)

    if (!integratedResult.ok || !integratedResult.data) {
      state.pipelineError = {
        stage: 'bom_cost_suppliers',
        message: integratedResult.error || 'Integrated BOM/Cost/Suppliers stage returned no data',
        occurredAt: new Date().toISOString(),
        recoverable: true,
      }
      console.error(`[pipeline] Integrated BOM failed: ${integratedResult.error}. Producing error PDF.`)
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

    const d = integratedResult.data
    state.parts = d.parts                                          // backwards compat
    state.bomLines = d.bomLines.map(bl => ({                      // strip IntegratedBomLine extras
      parentPartId: null,
      childPartId: bl.partNumber,
      quantity: bl.quantity,
    }))
    state.costBreakdown = d.costBreakdown                         // backwards compat
    state.costSummary = d.costSummary                             // canonical SoT for all cost consumers
    state.suppliers = d.supplierMatches                           // backwards compat — skip stage 5
    ;(state as any).costWaterfall = d.costWaterfall
    ;(state as any).integratedBomLines = d.bomLines
    ;(state as any).sectionBom = d.sectionBom
    ;(state as any).sectionCost = d.sectionCost
    ;(state as any).sectionSuppliers = d.sectionSuppliers

    state.sourceAttributions.push(
      { section: 'BOM', source: 'deterministic', detail: 'Deterministic expansion from keyParts manifest' },
      { section: 'BOM', source: 'llm', detail: 'Gemini 3.1 Pro — PROPOSE_PARTS sub-task' },
      { section: 'Cost', source: 'deterministic', detail: 'Distributor APIs (Mouser + Digi-Key + Farnell)' },
      { section: 'Cost', source: 'llm', detail: 'ESTIMATE_MAKE_COST sub-task (Grade D)' },
      { section: 'Suppliers', source: 'database', detail: 'Nightshift corpus semantic search' },
    )
  } else {
  // ── v1: original 3-stage flow (BOM + Cost) ────────────────────────
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

  // ── Stage 5: Suppliers (v1 path only) ─────────────────────────────────
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

  } // end else USE_INTEGRATED_BOM (v1 BOM pipeline)

  // ── PA Stage 4: Regulatory Extraction (PA_PIPELINE=true only) ────────────
  // Runs AFTER BOM so it can reference real materials and processes from the BOM.
  // Produces state.regulatoryExtraction (RegulatoryExtraction with source_grade='C',
  // verification_status='UNVERIFIED'). Dual-writes to state.research.designBrief.regulatory
  // so downstream stages that read the legacy shape keep working.
  // Legacy path: regulatory remains embedded in Research output.
  if (paMode && state.parsedBrief) {
    console.log('\n[pipeline] === PA Stage 4: Regulatory Extraction ===')
    const regulatoryResult = await runRegulatoryExtraction(state.parsedBrief, classification)
    trackStage('regulatory_extraction', regulatoryResult)

    if (regulatoryResult.ok && regulatoryResult.data) {
      state.regulatoryExtraction = regulatoryResult.data

      // Dual-write: synthesise legacy state.research.designBrief.regulatory shape
      // so downstream stages that read state.research.designBrief.regulatory keep working.
      //
      // D1 council BLOCKER-D1-4 fix (2/6 seats: GLM-5.1, MiMo):
      // The summary field previously mapped to e.applicability — same as the
      // applicability field, so council-scorer saw identical values in both
      // columns and lost scoring signal. Fixed: summary now derives from
      // `standard_name (jurisdiction)` which describes WHAT the regulation is,
      // while applicability retains WHY it applies to this specific product.
      if (state.research) {
        const legacyRegulatory = regulatoryResult.data.regulatory_entries.map(e => ({
          code: e.standard_name,
          name: e.standard_name,
          // D1-4 fix: summary = "what the regulation is" not "why it applies"
          summary: `${e.standard_name} (${e.jurisdiction})`,
          status: e.status,
          applicability: e.applicability,
          designImpact: e.engineering_impact,
          evidenceRequired: e.evidence_required,
          ownerRole: e.owner,
          gapAction: e.gap_action,
        }))

        // D1 council BLOCKER-D1-3 fix (5/6 seats: GPT-5.4, Grok, GLM-5.1, Kimi, MiMo):
        // If state.research.designBrief is null/undefined (possible when Research
        // Synthesis produced a shape without designBrief), the write was silently
        // skipped. All three downstream consumers (council-scorer, score-rubric,
        // calculators) would see zero regulatory data even though PA Stage 4 succeeded.
        // Force-initialise designBrief with the regulatory data if it is absent.
        if (!state.research.designBrief) {
          console.warn(
            '[pipeline] PA Regulatory dual-write: state.research.designBrief was null/undefined — ' +
            'force-initialising with regulatory data. This may indicate an issue in Research Synthesis.'
          )
          state.research.designBrief = { regulatory: legacyRegulatory } as any
        } else {
          state.research.designBrief.regulatory = legacyRegulatory
        }
      }

      console.log(
        `[pipeline] PA Regulatory Extraction complete: ${regulatoryResult.data.regulatory_entries.length} entries. ` +
        `All source_grade=C, verification_status=UNVERIFIED. Dual-wrote to state.research.designBrief.regulatory.`
      )
    } else {
      // Non-fatal: log warning and continue. Review will proceed without regulatory context.
      console.warn(
        `[pipeline] PA Regulatory Extraction failed: ${regulatoryResult.error}. ` +
        `Continuing without regulatoryExtraction — risk register will not have regulatory context.`
      )
    }
  }

  // ── Stage 6: Review ────────────────────────────────────────────────
  // Phase F: on PA path, Review only runs when reportType === 'FULL_REPORT'.
  // Skip on FEASIBILITY_EXCEPTION and BRIEF_INCOMPLETE — saves ~3-5 min on
  // those paths where a detailed engineering review adds no value.
  // On the legacy path (PA_PIPELINE=false), Review runs unconditionally as before.
  const _shouldRunReview = !paMode || state.reportType === 'FULL_REPORT'
  if (_shouldRunReview) {
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
  } else {
    trackSkippedStage('review', `PA path: skipped on ${state.reportType} — Review is FULL_REPORT-only (Phase F)`)
    console.log(`[pipeline] Review SKIPPED — PA path, reportType=${state.reportType}`)
  }

  // ── Stage 6b: FMEA Generation ──────────────────────────────────────
  // Runs after Review so the Fang per-module reviews are done. Non-fatal —
  // if FMEA generation fails, the renderer falls back to module riskMatrix rows.
  // On the PA path, modules carry failure_modes (not riskMatrix), so without
  // this stage the FMEA section would be empty.
  const _shouldRunFmea = !paMode || state.reportType === 'FULL_REPORT'
  if (_shouldRunFmea && state.modules.length > 0) {
    console.log('\n[pipeline] === Stage 6b: FMEA Generation ===')
    const fmeaResult = await runFmeaGeneration(
      state.modules,
      state.briefText || '',
      (state as any).productClass || undefined,
    )
    trackStage('fmea_generation', fmeaResult)
    if (fmeaResult.ok && fmeaResult.data && fmeaResult.data.length >= 4) {
      ;(state as any).fmea = fmeaResult.data
      console.log(`[pipeline] FMEA Generation complete: ${fmeaResult.data.length} rows stored.`)
      state.sourceAttributions.push({
        section: 'Risk Register (FMEA)',
        source: 'llm',
        detail: 'Gemini 3.1 Pro — domain-specific FMEA with S/O/D/RPN columns',
      })
    } else {
      console.warn(`[pipeline] FMEA Generation returned insufficient rows — renderer will fall back to module riskMatrix.`)
    }
  } else {
    console.log('[pipeline] FMEA Generation SKIPPED — no modules or non-FULL_REPORT path.')
  }

  // ── Council Scoring (the improvement engine) ───────────────────────
  // Phase F: on PA path, Council Scoring only runs when reportType === 'FULL_REPORT'.
  // Skip on FEASIBILITY_EXCEPTION and BRIEF_INCOMPLETE — saves ~3-5 min on those
  // paths. On the legacy path (PA_PIPELINE=false), Council Scoring runs unconditionally.
  const _shouldRunCouncil = !paMode || state.reportType === 'FULL_REPORT'
  if (_shouldRunCouncil) {
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
  } else {
    // F-2 fix (5 seats): emit a trackSkippedStage record for council_scoring so
    // telemetry consumers see a gap entry rather than silently missing the stage.
    // Previously only console.log was emitted — Review and Polish both used
    // trackSkippedStage but Council Scoring did not.
    trackSkippedStage('council_scoring', `PA path: skipped on ${state.reportType} — Council Scoring is FULL_REPORT-only (Phase F)`)
    console.log(`[pipeline] Council Scoring SKIPPED — PA path, reportType=${state.reportType}`)
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
  // Phase F: Polish is DROPPED on PA path. The Module Decomposition prompt
  // (PA Stage 5) must produce publication-quality technical_description directly.
  // If quality drops, the RL loop iterates the prompt — not a Polish post-process.
  // PA principle: "The LLM never post-processes data that feeds the renderer."
  // Legacy path (PA_PIPELINE=false): Polish runs unconditionally as before.
  if (!paMode) {
    console.log('\n[pipeline] === Polish Pass ===')
    const polishResult = await runPolish(state)
    if (polishResult.ok && polishResult.data) {
      state.modules = polishResult.data.modules
      console.log('[polish] Narrative polished successfully')
    } else {
      console.log('[polish] Polish pass skipped:', polishResult.error)
    }
  } else {
    trackSkippedStage('polish', 'dropped on PA path per PA principle (Phase F) — see stages/7-polish.ts @deprecated')
  }

  } // end else (feasibility not RED)
  } // end else (brief is valid)

  // ── Stage 7: PDF ───────────────────────────────────────────────────
  console.log('\n[pipeline] === Stage 7: PDF ===')
  console.log(`[pipeline] State: modules=${state.modules?.length}, parts=${state.parts?.length}, research=${!!state.research}`)
  const pdfStart = Date.now()
  try {
    const doc = React.createElement(getActivePdfRenderer(renderer), { state }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const base64 = buffer.toString('base64')
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: true, durationMs: pdfMs })
    console.log(`[pipeline] pdf (renderer=${renderer}): OK (${pdfMs}ms)`)

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
