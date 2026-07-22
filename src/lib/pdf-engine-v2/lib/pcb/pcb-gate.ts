/**
 * @file PCB honest-failure gate — Phase D (2026-07-12).
 * @description The universal "never show a green PCB tab without a real board"
 * net. A design whose OWN electronic content says it needs a BESPOKE board
 * (`state.pcb.isPcbBearing===true` AND `state.pcb.disposition==='bespoke'`) but
 * whose pipeline did NOT come out DRC-clean/routed/Gerber-complete
 * (`pipeline.ok !== true`) is an honest engineering failure — never a fabricated
 * PASS. Mirrors the gates 31-37 shadow/enforcing philosophy in
 * `CentaurOS-oxccu-efuel/CLAUDE.md`: pure, deterministic decision function here;
 * SHADOW by default (records + logs, never blocks); enforcing is opt-in via
 * `PCB_GATE_ENFORCING`. Gate is entirely inert when `state.pcb` is absent
 * (PCB_STAGE was off) or the disposition never required a bespoke board — the
 * capability stays fully opt-in per the integration plan.
 *
 * Distinct from `disposition.ts` (decides bespoke-vs-COTS from evidence) and
 * `pcb-pipeline.ts` (runs the toolchain, returns `ok` honestly) — this file is
 * the THIRD, independent check: does the pipeline's own verdict match what the
 * design's own disposition required?
 */

import type { PcbStageResult } from './pcb-stage'

/**
 * Minimum fraction of the design's own claimed electronic parts that a bespoke board
 * must actually place as footprints before a DRC-clean pipeline may be called a real
 * board (rather than a token board that routes a sparse netlist). 0.8 = the board must
 * implement ≥80% of the claimed parts. Tuned against the 2026-07-18 token boards
 * (rodeostat 8/14≈57%, opendrop 10/16≈63% — both must fire).
 */
export const PCB_MIN_FOOTPRINT_COVERAGE = 0.8

/**
 * INTENT: Multi-board aggregation (pcb-multi-board-run) historically stamped
 * footprints under `pipeline.generator.components` / `componentCount` and left
 * top-level `pipeline.components` undefined. Reading only `pipeline.components`
 * reported 0/N coverage on every organoid bake (final3–final9) despite 26 real
 * footprints — a bookkeeping Goodhart that floored the PCB tab at 0.
 *
 * @description Count placed footprints from a pipeline record, preferring the
 * explicit top-level count then the generator summary.
 * @param pipeline - `state.pcb.pipeline` (or a test stub)
 * @returns Non-negative placed footprint count
 */
export function countPlacedPipelineComponents(pipeline: {
  components?: number | null
  generator?: {
    componentCount?: number | null
    components?: ReadonlyArray<unknown> | null
  } | null
} | null | undefined): number {
  if (!pipeline) return 0
  const top = pipeline.components
  if (typeof top === 'number' && Number.isFinite(top) && top >= 0) {
    return top
  }
  const gen = pipeline.generator
  if (gen) {
    const n = gen.componentCount
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return n
    }
    if (Array.isArray(gen.components)) {
      return gen.components.length
    }
  }
  return 0
}

export interface PcbGateResult {
  /** False when the gate has nothing to say about this design (no PCB content,
   *  or a COTS/none disposition that never needed a bespoke pipeline run). */
  applicable: boolean
  /** True = the honest-failure condition is present (bespoke required, board not clean). */
  fires: boolean
  reason: string
  details: string[]
}

/**
 * @description Pure decision: does the PCB honest-failure gate fire for this
 * `state.pcb` record? Fires ONLY when the design's OWN disposition says it needs
 * a bespoke board AND the pipeline that was actually run (or honestly recorded
 * as unattempted) did not produce a DRC-clean, routed, Gerber-complete board.
 * Never fires for a COTS-module or not-applicable disposition, and never fires
 * when `pcb` itself is absent (PCB_STAGE was off for this run).
 * @param pcb - `state.pcb` as recorded by `runPcbStage()` (+ the Phase D pipeline
 *   patch applied by the chain), or null/undefined when PCB_STAGE never ran.
 */
export function evaluatePcbGate(pcb: PcbStageResult | null | undefined): PcbGateResult {
  if (!pcb) {
    return { applicable: false, fires: false, reason: 'no_pcb_state_pcb_stage_off', details: [] }
  }
  if (!pcb.isPcbBearing || pcb.disposition !== 'bespoke') {
    return {
      applicable: false,
      fires: false,
      reason: !pcb.isPcbBearing ? 'not_pcb_bearing' : `disposition_${pcb.disposition}_not_bespoke`,
      details: [],
    }
  }

  const pipeline = pcb.pipeline
  if (!pipeline) {
    // Bespoke board was required by the design's own evidence but no pipeline run
    // was ever recorded against it — an honest failure, not a silent pass.
    return {
      applicable: true,
      fires: true,
      reason: 'bespoke_required_no_pipeline_attempted',
      details: [
        'design requires a bespoke PCB (isPcbBearing=true, disposition=bespoke) but ' +
          'no pipeline result was recorded under state.pcb.pipeline',
      ],
    }
  }

  if (pipeline.ok === true) {
    // HONESTY: a DRC-clean, routed, Gerber-complete pipeline proves the TOOLCHAIN ran —
    // NOT that the board implements the instrument (Cursor PCB audit + Tristan 2026-07-18:
    // the accepted boards are ~2/10 token boards — 8/14 & 10/16 footprints vs claimed
    // electronic parts, 0 vias, 0 copper zones, mostly TBD MPNs — yet all reported
    // 'clean_board'). 'clean_board' was scoring the wrong thing. A bespoke board whose
    // footprint COVERAGE of the design's own claimed electronic parts is materially
    // incomplete is a token board, not a shippable PCBA → the gate fires.
    const expected = Number(pcb.electronicPartCount ?? 0)
    // GOTCHA: do NOT use `pipeline.components ?? 0` alone — multi-board aggregates
    // put the count under generator (see countPlacedPipelineComponents).
    const placed = countPlacedPipelineComponents(pipeline)
    const coverage = expected > 0 ? placed / expected : 1
    if (expected >= 4 && coverage < PCB_MIN_FOOTPRINT_COVERAGE) {
      return {
        applicable: true,
        fires: true,
        reason: 'clean_toolchain_but_incomplete_board',
        details: [
          `footprint coverage ${placed}/${expected} = ${(coverage * 100).toFixed(0)}% ` +
            `(< ${(PCB_MIN_FOOTPRINT_COVERAGE * 100).toFixed(0)}% required) — the board does ` +
            `not place most of the design's own claimed electronic parts`,
          'DRC-clean on a sparse netlist proves the toolchain ran, not that the board ' +
            'implements the instrument (token board)',
        ],
      }
    }

    // P6: toolchain hygiene ≠ architecture fitness / multi-board honesty.
    const fitness = pcb.designFitness
    if (fitness && fitness.ok === false) {
      const highs = (fitness.findings ?? []).filter((f) => f.severity === 'high')
      if (highs.length > 0) {
        return {
          applicable: true,
          fires: true,
          reason: 'clean_toolchain_but_architecture_unfit',
          details: highs.slice(0, 5).map((f) => f.message ?? 'architecture unfit'),
        }
      }
    }

    if (pcb.multiBoardMerged === true) {
      return {
        applicable: true,
        fires: true,
        reason: 'clean_toolchain_but_multi_board_merged',
        details: [
          'architecture requires multiple KiCad deliverables but only one project was generated',
        ],
      }
    }

    return { applicable: true, fires: false, reason: 'clean_board', details: [] }
  }

  const details: string[] = [
    `stage_reached=${pipeline.stageReached}`,
    `routed=${pipeline.routed}`,
    `drc_ran=${pipeline.drc?.ran ?? false} drc_violations=${pipeline.drc?.violations ?? 'n/a'}`,
    ...(pipeline.errors ?? []).slice(0, 3),
  ]
  return {
    applicable: true,
    fires: true,
    reason: 'bespoke_required_pipeline_not_clean',
    details,
  }
}

/**
 * @description off/0/false/no/shadow (case-insensitive, incl. unset) -> 'shadow'
 * (record + log, never block); anything else -> 'enforcing'. Mirrors
 * `drawingGatesEnforceModeFromEnv`-style helpers used by gates 31-37.
 */
export function pcbGateEnforceModeFromEnv(raw: string | undefined): 'shadow' | 'enforcing' {
  const v = (raw ?? '').trim().toLowerCase()
  if (['', '0', 'false', 'no', 'off', 'shadow'].includes(v)) return 'shadow'
  return 'enforcing'
}

if (require.main === module) {
  // proveCatch: both directions, run standalone (no state.json needed).
  const clean: PcbStageResult = {
    isPcbBearing: true,
    electronicPartCount: 5,
    distinctElectronicCategories: ['processor', 'analog_frontend', 'display'],
    reasons: ['electronic_function_diversity_3_categories'],
    signals: {} as PcbStageResult['signals'],
    capability: {} as PcbStageResult['capability'],
    disposition: 'bespoke',
    dispositionDetail: {} as PcbStageResult['dispositionDetail'],
    canAuthor: true,
    canRoute: true,
    canVerifyAndExport: true,
    pipeline: {
      ok: true,
      stageReached: 'export',
      routed: true,
      drc: { ran: true, violations: 0 },
      components: 5,   // all 5 claimed parts placed → complete board
      errors: [],
    },
  }
  const failed: PcbStageResult = {
    ...clean,
    pipeline: {
      ok: false,
      stageReached: 'drc',
      routed: true,
      drc: { ran: true, violations: 4 },
      errors: ['4 DRC violations remain after routing'],
    },
  }
  const cots: PcbStageResult = { ...clean, disposition: 'cots-modules', pipeline: undefined }
  // Token board: DRC-clean pipeline but only 8/14 claimed parts placed (the 2026-07-18
  // rodeostat shape) — must FIRE the completeness check even though pipeline.ok=true.
  const token: PcbStageResult = {
    ...clean,
    electronicPartCount: 14,
    pipeline: { ...clean.pipeline!, ok: true, components: 8 },
  }
  // A complete board (14/14 placed) must still PASS.
  const complete: PcbStageResult = {
    ...clean,
    electronicPartCount: 14,
    pipeline: { ...clean.pipeline!, ok: true, components: 14 },
  }
  // Multi-board aggregate shape (organoid final9): components only under generator.
  const generatorOnly: PcbStageResult = {
    ...clean,
    electronicPartCount: 16,
    pipeline: {
      ok: true,
      stageReached: 'complete',
      routed: true,
      drc: { ran: true, violations: 0 },
      errors: [],
      generator: {
        componentCount: 26,
        netCount: 13,
        unresolvedCount: 0,
        unresolved: [],
        components: Array.from({ length: 26 }, (_, i) => ({
          instanceName: `part_${i}`,
          nameHuman: `Part ${i}`,
          characterId: 'generic',
          manufacturer: 'X',
          partNumber: `PN-${i}`,
          footprint: null,
          resolutionTier: 'mpn_symbol_footprint',
          quantityInDesign: 1,
        })),
      },
    },
  }

  // P6: clean pipeline + architecture unfit / multi-board smash must still fire.
  const unfit: PcbStageResult = {
    ...clean,
    designFitness: {
      ok: false,
      findings: [{
        severity: 'high',
        message: 'board missing required roles: od_optics',
      }],
    },
  }
  const merged: PcbStageResult = {
    ...clean,
    multiBoardMerged: true,
  }

  const rClean = evaluatePcbGate(clean)
  const rFailed = evaluatePcbGate(failed)
  const rCots = evaluatePcbGate(cots)
  const rNone = evaluatePcbGate(null)
  const rToken = evaluatePcbGate(token)
  const rComplete = evaluatePcbGate(complete)
  const rGeneratorOnly = evaluatePcbGate(generatorOnly)
  const rUnfit = evaluatePcbGate(unfit)
  const rMerged = evaluatePcbGate(merged)

  const ok =
    rClean.applicable === true && rClean.fires === false &&
    rFailed.applicable === true && rFailed.fires === true &&
    rCots.applicable === false && rCots.fires === false &&
    rNone.applicable === false && rNone.fires === false &&
    rToken.fires === true && rToken.reason === 'clean_toolchain_but_incomplete_board' &&
    rComplete.fires === false &&
    rGeneratorOnly.fires === false && rGeneratorOnly.reason === 'clean_board' &&
    rUnfit.fires === true && rUnfit.reason === 'clean_toolchain_but_architecture_unfit' &&
    rMerged.fires === true && rMerged.reason === 'clean_toolchain_but_multi_board_merged'

  console.log(JSON.stringify({ rClean, rFailed, rCots, rNone, rUnfit, rMerged }, null, 2))
  console.log(ok ? 'PCB GATE proveCatch: PASS' : 'PCB GATE proveCatch: FAIL')
  process.exit(ok ? 0 : 1)
}
