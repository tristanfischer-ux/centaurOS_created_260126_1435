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
import { runDecompose, runDecomposePA } from './stages/2-decompose'
import { runRegulatoryExtraction } from './stages/1b-regulatory'
import { runSizeLayout } from './stages/3-size-layout'
import { runBomCost } from './stages/4-bom-cost'
import { runSuppliers } from './stages/5-suppliers'
import { runBomCostSuppliers } from './stages/4-bom-cost-suppliers'
import { runReview } from './stages/6-review'
import PdfRenderer from './stages/7-pdf'
import PdfRendererV3 from './stages/7-pdf-v3'

// PDF_RENDERER=v3 activates the BESS-style renderer (7-pdf-v3.tsx).
// Default is v2 (the existing 7-pdf.tsx). Both renderers remain active.
const _pdfRendererVersion = process.env.PDF_RENDERER ?? 'v2'
const _activePdfRenderer = _pdfRendererVersion === 'v3' ? PdfRendererV3 : PdfRenderer

// PA_PIPELINE=true activates the Prompt Architecture migration path (Phase A+).
// Default is 'false' — existing pipeline runs unchanged.
// Set PA_PIPELINE=true in .env.local or vercel env to test the new path.
const PA_PIPELINE = (process.env.PA_PIPELINE ?? 'false') === 'true'
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
import { extractSpecs, summariseSpecs } from './lib/spec-extraction'
import { mapProductClassToIndustryDomain } from './lib/industry-domain'

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
    const doc = React.createElement(_activePdfRenderer, { state }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const base64 = buffer.toString('base64')
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: true, durationMs: pdfMs })
    console.log(`[pipeline] pdf (error path, renderer=${_pdfRendererVersion}): OK (${pdfMs}ms, ${Math.round(buffer.length / 1024)}KB)`)

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

  // BLOCKER-1 fix: hoist syntheticDesignBrief so it survives the
  // `state.research = researchResult.data` overwrite at the Research stage.
  // After the overwrite we re-merge the PA constraints back in.
  let _paSyntheticDesignBrief: ReturnType<typeof _buildSyntheticDesignBrief> | null = null

  // ── PA Stage 1: Brief Parsing (PA_PIPELINE=true only) ────────────────
  // Runs BEFORE Classification. Produces state.parsedBrief (StructuredBriefJSON).
  // On PA_PIPELINE=false this block is skipped entirely — existing pipeline unchanged.
  if (PA_PIPELINE) {
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
  const briefValidation = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields, PA_PIPELINE ? state.parsedBrief : null)
  
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
  if (!PA_PIPELINE) {
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
  }

  // ── Stage 2: Research ─────────────────────────────────────────────────
  // Phase B: on PA_PIPELINE=true, use runResearchSynthesis() (PA Stage 3).
  // On PA_PIPELINE=false, use the legacy runResearch() — unchanged.
  console.log('\n[pipeline] === Stage 2: Research ===')

  if (PA_PIPELINE && state.parsedBrief) {
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
      sources: synthesis.research_sources.map(s => ({ uri: '', title: s.title })),
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
  // NOTED-3 fix: on PA_PIPELINE=true the parsedBrief already holds all
  // structured constraints.  runBriefGeneration() adds a second LLM call
  // and would overwrite designBrief with research-informed — but not PA-
  // informed — data. Gate it off so the PA path only uses the new parser.
  // Phase B will remove this stage from the PA path entirely.
  if (!PA_PIPELINE) {
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
  } // end if (!PA_PIPELINE) — Brief Generation stage

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
  const briefValidationPost = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields, PA_PIPELINE ? state.parsedBrief : null)
  
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

  // ── Feasibility → Brief Feedback Loop ───────────────────────────────
  // When Feasibility finds impossible constraints, revise the Brief with
  // feasible alternatives and re-run Feasibility. Max 2 revisions.
  const MAX_REVISIONS = 2
  let revisionCount = 0
  const rejectedConstraints: string[] = []

  while ((feasibility.status === 'RED' || feasibility.status === 'AMBER') && revisionCount < MAX_REVISIONS) {
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
      if (PA_PIPELINE) {
        const revisedBriefText = state.generatedBrief?.briefText || briefText
        const reparseResult = await runBriefParsing(revisedBriefText)
        if (reparseResult.ok && reparseResult.data) {
          state.parsedBrief = reparseResult.data
          console.log(`[pipeline] PA: re-parsed brief after revision ${revisionCount} — missing=${reparseResult.data.missing_mandatory_fields.length}`)
        } else {
          console.warn(`[pipeline] PA: re-parse after revision ${revisionCount} failed: ${reparseResult.error}. Using stale parsedBrief.`)
        }
      }

      // Re-run Feasibility with updated constraints
      const newBriefValidation = validateBrief(briefText, state.research?.designBrief as any || null, classification.productClass, requiredFields, PA_PIPELINE ? state.parsedBrief : null)
      const newFeasibility = determineFeasibility(newBriefValidation, sizingResult, null, classification.productClass)
      
      // Update feasibility
      Object.assign(feasibility, newFeasibility)
      ;(state as any).feasibility = feasibility
      console.log(`[pipeline] Feasibility after revision ${revisionCount}: ${feasibility.status}`)
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

  // ── PA Stage 4: Regulatory Extraction (PA_PIPELINE=true only) ────────────
  // Runs after Research Synthesis lands, before Module Decomposition.
  // Produces state.regulatoryExtraction (RegulatoryExtraction with source_grade='C',
  // verification_status='UNVERIFIED'). Dual-writes to state.research.designBrief.regulatory
  // so downstream stages that read the legacy shape keep working.
  // Legacy path: regulatory remains embedded in Research output.
  if (PA_PIPELINE && state.parsedBrief) {
    console.log('\n[pipeline] === PA Stage 4: Regulatory Extraction ===')
    const regulatoryResult = await runRegulatoryExtraction(state.parsedBrief, classification)
    trackStage('regulatory_extraction', regulatoryResult)

    if (regulatoryResult.ok && regulatoryResult.data) {
      state.regulatoryExtraction = regulatoryResult.data

      // Dual-write: synthesise legacy state.research.designBrief.regulatory shape
      // so downstream stages that read state.research.designBrief.regulatory keep working.
      if (state.research) {
        const legacyRegulatory = regulatoryResult.data.regulatory_entries.map(e => ({
          code: e.standard_name,
          name: e.standard_name,
          summary: e.applicability,
          status: e.status,
          applicability: e.applicability,
          designImpact: e.engineering_impact,
          evidenceRequired: e.evidence_required,
          ownerRole: e.owner,
          gapAction: e.gap_action,
        }))
        if (state.research.designBrief) {
          state.research.designBrief.regulatory = legacyRegulatory
        }
      }

      console.log(
        `[pipeline] PA Regulatory Extraction complete: ${regulatoryResult.data.regulatory_entries.length} entries. ` +
        `All source_grade=C, verification_status=UNVERIFIED. Dual-wrote to state.research.designBrief.regulatory.`
      )
    } else {
      // Non-fatal: log warning and continue. Decompose will proceed without regulatory context.
      console.warn(
        `[pipeline] PA Regulatory Extraction failed: ${regulatoryResult.error}. ` +
        `Continuing without regulatoryExtraction — module decomposition will not have regulatory context.`
      )
    }
  }

  // ── Stage 2: Decompose ─────────────────────────────────────────────
  // Phase D1: on PA_PIPELINE=true, use runDecomposePA() (PA Stage 5 schema).
  // On PA_PIPELINE=false, use the legacy runDecompose() — unchanged.
  console.log('\n[pipeline] === Stage 2: Decompose ===')

  let decomposeResult: Awaited<ReturnType<typeof runDecompose>>

  if (PA_PIPELINE && state.parsedBrief) {
    // ── PA path: runDecomposePA uses PA Stage 5 prompt + schema ───────────
    console.log('[pipeline] PA path: running PA Stage 5 Module Decomposition...')
    const paResult = await runDecomposePA(
      state.parsedBrief,
      classification.productClass,
      state.regulatoryExtraction,
    )
    // Cast to legacy type for unified error handling below (ModulePA extends Module)
    decomposeResult = paResult as typeof decomposeResult
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
    const doc = React.createElement(_activePdfRenderer, { state }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const base64 = buffer.toString('base64')
    const pdfMs = Date.now() - pdfStart
    stages.push({ name: 'pdf', ok: true, durationMs: pdfMs })
    console.log(`[pipeline] pdf (renderer=${_pdfRendererVersion}): OK (${pdfMs}ms)`)

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
