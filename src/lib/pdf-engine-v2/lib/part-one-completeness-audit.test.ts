// Regression guard for the Part-1 completeness gate (exit 36, Phase 0 2026-06-10).
// Jest (runs in `npm test` / the pre-push gate). Verified directionally against
// the REAL out/compute-heat-module-v5 (HOLLOW) + out/bess-newstructure-v1 (PASS).
import {
  computePartOneCompleteness,
  evaluatePartOneCompletenessEnforcement,
  partOneCompletenessEnforceModeFromEnv,
  PART_ONE_COMPLETENESS_EXIT_CODE,
} from './part-one-completeness-audit'

const onlyBreadcrumbs = {
  orchestratorContract: {
    quantities: {
      auto_planned_tool_ran__pem_electrolyser: { value: 1, unit: 'flag' },
      auto_planned_tool_ran__spacecraft_radiator: { value: 1, unit: 'flag' },
      auto_planned_tool_ran__ev_battery_taper: { value: 1, unit: 'flag' },
    },
  },
}

const realDesign = {
  orchestratorContract: {
    quantities: {
      nameplate_capacity_kwh: { value: 4489, unit: 'kWh' },
      continuous_power_kw: { value: 1000, unit: 'kW' },
      dc_bus_voltage_v: { value: 800, unit: 'V' },
      cell_count: { value: 5010, unit: 'cells' },
    },
  },
}

describe('part-one-completeness gate', () => {
  it('flags a quantities-are-ONLY-breadcrumbs state as HOLLOW (the compute_heat case)', () => {
    const r = computePartOneCompleteness(onlyBreadcrumbs)
    expect(r.verdict).toBe('hollow')
    expect(r.real_quantity_count).toBe(0)
    expect(r.breadcrumb_count).toBe(3)
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('passes a state with real engineering quantities (the BESS case)', () => {
    const r = computePartOneCompleteness(realDesign)
    expect(r.verdict).toBe('pass')
    expect(r.real_quantity_count).toBe(4)
    expect(r.breadcrumb_count).toBe(0)
  })

  it('returns unavailable (never blocks) when there is no orchestratorContract.quantities', () => {
    expect(computePartOneCompleteness({}).verdict).toBe('unavailable')
    expect(computePartOneCompleteness({ orchestratorContract: {} }).verdict).toBe('unavailable')
    expect(computePartOneCompleteness(null).verdict).toBe('unavailable')
  })

  it('thin + ungrounded + ZERO worked-calcs is HOLLOW', () => {
    const r = computePartOneCompleteness({
      orchestratorContract: {
        quantities: {
          auto_planned_tool_ran__x: { value: 1, unit: 'flag' },
          one_real_q: { value: 5, unit: 'kW' },
        },
      },
    })
    expect(r.verdict).toBe('hollow')
  })

  it('thin but WITH worked-calc steps is NOT hollow (real maths present)', () => {
    const r = computePartOneCompleteness({
      orchestratorContract: {
        quantities: {
          auto_planned_tool_ran__x: { value: 1, unit: 'flag' },
          one_real_q: { value: 5, unit: 'kW' },
        },
        worked_calculations: { tool_a: [{ label: 'x', formula: 'a=b·c' }] },
      },
    })
    expect(r.verdict).toBe('pass')
    expect(r.worked_calc_step_count).toBe(1)
  })

  it('counts worked-calc steps from toolsUsedPage too', () => {
    const r = computePartOneCompleteness({
      orchestratorContract: { quantities: { a: { value: 1 }, b: { value: 2 }, c: { value: 3 }, d: { value: 4 } } },
      toolsUsedPage: { tools: [{ worked: [{}, {}] }, { worked: [{}] }] },
    })
    expect(r.worked_calc_step_count).toBe(3)
  })

  it('enforcement: hollow + on → shouldExit with code 36; off → no exit; pass + on → no exit', () => {
    const hollow = computePartOneCompleteness(onlyBreadcrumbs)
    const onHollow = evaluatePartOneCompletenessEnforcement(hollow, 'on')
    expect(onHollow.shouldExit).toBe(true)
    expect(onHollow.exitCode).toBe(PART_ONE_COMPLETENESS_EXIT_CODE)
    expect(PART_ONE_COMPLETENESS_EXIT_CODE).toBe(36)
    expect(evaluatePartOneCompletenessEnforcement(hollow, 'off').shouldExit).toBe(false)
    const pass = computePartOneCompleteness(realDesign)
    expect(evaluatePartOneCompletenessEnforcement(pass, 'on').shouldExit).toBe(false)
  })

  it('enforce-mode-from-env: shadow/off/0/false/empty/undefined → off; anything else truthy → on', () => {
    for (const v of [undefined, '', '0', 'false', 'off', 'shadow', 'SHADOW']) {
      expect(partOneCompletenessEnforceModeFromEnv(v)).toBe('off')
    }
    for (const v of ['1', 'true', 'on', 'enforce']) {
      expect(partOneCompletenessEnforceModeFromEnv(v)).toBe('on')
    }
  })
})
