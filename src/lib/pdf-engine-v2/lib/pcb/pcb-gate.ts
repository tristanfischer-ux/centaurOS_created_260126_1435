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

  const rClean = evaluatePcbGate(clean)
  const rFailed = evaluatePcbGate(failed)
  const rCots = evaluatePcbGate(cots)
  const rNone = evaluatePcbGate(null)

  const ok =
    rClean.applicable === true && rClean.fires === false &&
    rFailed.applicable === true && rFailed.fires === true &&
    rCots.applicable === false && rCots.fires === false &&
    rNone.applicable === false && rNone.fires === false

  console.log(JSON.stringify({ rClean, rFailed, rCots, rNone }, null, 2))
  console.log(ok ? 'PCB GATE proveCatch: PASS' : 'PCB GATE proveCatch: FAIL')
  process.exit(ok ? 0 : 1)
}
