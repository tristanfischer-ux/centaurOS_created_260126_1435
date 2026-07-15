/**
 * @file pcb-gate.test.ts — Phase D honest-failure gate verification (2026-07-12).
 * @description proveCatch both directions + the applicability short-circuits.
 */

import { evaluatePcbGate, pcbGateEnforceModeFromEnv } from './pcb-gate'
import type { PcbStageResult } from './pcb-stage'

function baseState(overrides: Partial<PcbStageResult> = {}): PcbStageResult {
  return {
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
    ...overrides,
  }
}

describe('evaluatePcbGate', () => {
  it('PASSES on a clean, routed, DRC-zero-violation board with gerbers', () => {
    const state = baseState({
      pipeline: { ok: true, stageReached: 'export', routed: true, drc: { ran: true, violations: 0 }, errors: [] },
    })
    const r = evaluatePcbGate(state)
    expect(r.applicable).toBe(true)
    expect(r.fires).toBe(false)
    expect(r.reason).toBe('clean_board')
  })

  it('FIRES when a bespoke board is required but DRC violations remain', () => {
    const state = baseState({
      pipeline: { ok: false, stageReached: 'drc', routed: true, drc: { ran: true, violations: 4 }, errors: ['4 DRC violations remain'] },
    })
    const r = evaluatePcbGate(state)
    expect(r.applicable).toBe(true)
    expect(r.fires).toBe(true)
    expect(r.reason).toBe('bespoke_required_pipeline_not_clean')
    expect(r.details.join(' ')).toContain('drc_violations=4')
  })

  it('FIRES when the toolchain was missing and the pipeline never ran', () => {
    const state = baseState({
      pipeline: {
        ok: false, stageReached: 'toolchain_discovery', routed: false, drc: { ran: false, violations: null },
        errors: ['PCB toolchain unavailable on this host (canAuthor=false)'],
      },
    })
    const r = evaluatePcbGate(state)
    expect(r.applicable).toBe(true)
    expect(r.fires).toBe(true)
  })

  it('FIRES when bespoke is required but no pipeline record exists at all', () => {
    const state = baseState({ pipeline: undefined })
    const r = evaluatePcbGate(state)
    expect(r.applicable).toBe(true)
    expect(r.fires).toBe(true)
    expect(r.reason).toBe('bespoke_required_no_pipeline_attempted')
  })

  it('never fires for a COTS-modules disposition (pipeline never applicable)', () => {
    const state = baseState({ disposition: 'cots-modules', pipeline: undefined })
    const r = evaluatePcbGate(state)
    expect(r.applicable).toBe(false)
    expect(r.fires).toBe(false)
  })

  it('never fires for a not-applicable disposition / non-PCB-bearing design', () => {
    const state = baseState({ isPcbBearing: false, disposition: 'none' })
    const r = evaluatePcbGate(state)
    expect(r.applicable).toBe(false)
    expect(r.fires).toBe(false)
  })

  it('is entirely inert when state.pcb is absent (PCB_STAGE was off)', () => {
    expect(evaluatePcbGate(null)).toEqual({ applicable: false, fires: false, reason: 'no_pcb_state_pcb_stage_off', details: [] })
    expect(evaluatePcbGate(undefined)).toEqual({ applicable: false, fires: false, reason: 'no_pcb_state_pcb_stage_off', details: [] })
  })
})

describe('pcbGateEnforceModeFromEnv', () => {
  it.each(['', '0', 'false', 'no', 'off', 'shadow', 'SHADOW', undefined])('%s -> shadow', (v) => {
    expect(pcbGateEnforceModeFromEnv(v)).toBe('shadow')
  })
  it.each(['1', 'true', 'on', 'yes', 'enforcing'])('%s -> enforcing', (v) => {
    expect(pcbGateEnforceModeFromEnv(v)).toBe('enforcing')
  })
})
