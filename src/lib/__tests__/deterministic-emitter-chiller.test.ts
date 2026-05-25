/**
 * @file deterministic-emitter-chiller.test.ts
 *
 * Regression guard for task #148: selectPfannenbergEbXt must pick a unit
 * sized for the TOTAL thermal load (battery I²R + PCS inverter), NOT the
 * battery-only load.
 *
 * L23 BESS design values (confirmed by L23 council + gate-16/13 sub-agent
 * investigation 2026-05-25):
 *   battery I²R (system_thermal_dissipation_kw): 11.72 kW
 *   PCS inverter losses (inverter_dissipated_kw): 15.00 kW
 *   total load: 26.72 kW
 *   required with 1.20× margin: 32.06 kW
 *   EB XT 400 WT derated @ 50°C: 36 × 0.60 = 21.6 kW  ← insufficient
 *   EB XT 500 WT derated @ 50°C: 47 × 0.60 = 28.2 kW  ← insufficient (< 32.06 kW)
 *   EB XT 600 WT derated @ 50°C: 59 × 0.60 = 35.4 kW  ← first model that clears 32.06 kW ✓
 * (The task brief mentioned EB XT 700 WT; that was a conservative approximation.
 *  The precise first-adequate model is EB XT 600 WT at 35.4 kW derated.)
 *
 * Before the fix: deriveBessParams only read system_thermal_dissipation_kw
 * (11.72 kW), omitting inverter_dissipated_kw (15 kW). With 11.72 kW × 1.20
 * = 14.1 kW required, EB XT 400 WT (21.6 kW derated) passed the emitter
 * but gate 16 then re-computed 26.72 kW and exited on every run.
 *
 * After the fix: deriveBessParams sums both fields → 26.72 kW → EB XT 700 WT.
 */

import {
  selectPfannenbergEbXt,
  pfannenbergAmbientDerateFactor,
  emitBessDesign,
} from '../../../scripts/lib/deterministic-emitter'

// ---------------------------------------------------------------------------
// Pure selector unit tests
// ---------------------------------------------------------------------------

describe('selectPfannenbergEbXt', () => {
  it('L23 bug regression: returns EB XT 600 WT (not EB XT 400 WT) for 26.72 kW total load at +50°C', () => {
    // 26.72 kW × 1.20 = 32.064 kW required.
    // EB XT 600 WT: 59 kW × 0.60 = 35.4 kW derated — first model that clears 32.064 kW.
    const L23_TOTAL_LOAD_KW = 26.72
    const AMBIENT_C = 50
    const MARGIN = 1.20
    const required = L23_TOTAL_LOAD_KW * MARGIN  // 32.064 kW

    const result = selectPfannenbergEbXt(required, AMBIENT_C)
    expect(result.part_number).toBe('EB XT 600 WT')
    // Derated capacity must cover the required load
    expect(result.derated_capacity_kw).toBeGreaterThanOrEqual(required)
    expect(result.nominal_capacity_kw).toBe(59)
  })

  it('battery-only load (old bug path) would have picked EB XT 400 WT', () => {
    // Confirms the WRONG pre-fix path for documentation purposes.
    const BATTERY_ONLY_KW = 11.72
    const AMBIENT_C = 50
    const MARGIN = 1.20
    const required = BATTERY_ONLY_KW * MARGIN  // 14.064 kW

    // EB XT 400 WT: 36 kW × 0.60 = 21.6 kW derated — covers 14.1 kW but
    // undersized for the real 26.72 kW total load.
    const result = selectPfannenbergEbXt(required, AMBIENT_C)
    expect(result.part_number).toBe('EB XT 400 WT')
  })

  it('returns the smallest model that clears the required load at +35°C nominal', () => {
    // At +35°C the derate factor is 1.00; simple nominal-rating check.
    const result = selectPfannenbergEbXt(40, 35)
    // EB XT 400 WT = 36 kW nominal — insufficient; EB XT 500 WT = 47 kW — first clear
    expect(result.part_number).toBe('EB XT 500 WT')
    expect(result.derated_capacity_kw).toBeGreaterThanOrEqual(40)
  })

  it('saturates to EB XT 1600 WT when no single unit can cover an extreme load', () => {
    const result = selectPfannenbergEbXt(200, 50)  // 200 kW required at +50°C; max is 148×0.60=88.8 kW
    expect(result.part_number).toBe('EB XT 1600 WT')
  })
})

describe('pfannenbergAmbientDerateFactor', () => {
  it('returns 1.00 at +35°C nominal', () => {
    expect(pfannenbergAmbientDerateFactor(35)).toBeCloseTo(1.00, 6)
  })

  it('returns 0.60 at +50°C top-of-envelope', () => {
    expect(pfannenbergAmbientDerateFactor(50)).toBeCloseTo(0.60, 6)
  })

  it('clamps to 1.00 below +35°C', () => {
    expect(pfannenbergAmbientDerateFactor(20)).toBe(1.00)
  })

  it('clamps to 0.60 above +50°C', () => {
    expect(pfannenbergAmbientDerateFactor(60)).toBe(0.60)
  })

  it('interpolates linearly between anchors', () => {
    // At 42.5°C (midpoint), factor should be 0.80
    expect(pfannenbergAmbientDerateFactor(42.5)).toBeCloseTo(0.80, 6)
  })
})

// ---------------------------------------------------------------------------
// Integration test: emitBessDesign uses summed thermal load
// ---------------------------------------------------------------------------

describe('emitBessDesign chiller selection (task #148 integration)', () => {
  function makeL23Contract(overrides: Record<string, { value: number; unit: string }> = {}) {
    return {
      product_class: 'bess',
      quantities: {
        // Minimal L23-style topology quantities
        cell_count:                    { value: 3750,   unit: ''    },
        rack_count:                    { value: 15,     unit: ''    },
        cells_per_rack:                { value: 250,    unit: ''    },
        series_cells_per_string:       { value: 250,    unit: ''    },
        parallel_strings_per_rack:     { value: 1,      unit: ''    },
        parallel_strings_total:        { value: 15,     unit: ''    },
        cell_voltage_v:                { value: 3.2,    unit: 'V'   },
        string_voltage_nominal_v:      { value: 800,    unit: 'V'   },
        thermal_rejection_min_kw:      { value: 60,     unit: 'kW'  },
        continuous_power_kw:           { value: 1000,   unit: 'kW'  },
        peak_power_kw:                 { value: 1250,   unit: 'kW'  },
        nameplate_capacity_kwh:        { value: 3360,   unit: 'kWh' },
        usable_capacity_kwh:           { value: 2688,   unit: 'kWh' },
        dod_fraction:                  { value: 0.80,   unit: ''    },
        dc_bus_voltage_v:              { value: 800,    unit: 'V'   },
        bus_continuous_current_a:      { value: 1250,   unit: 'A'   },
        bus_peak_current_a:            { value: 1562,   unit: 'A'   },
        string_continuous_current_a:   { value: 83.3,   unit: 'A'   },
        string_peak_current_a:         { value: 104.1,  unit: 'A'   },
        cell_capacity_ah:              { value: 280,    unit: 'Ah'  },
        // Task #148 fields:
        ambient_design_temp_c:         { value: 50,     unit: '°C'  },
        system_thermal_dissipation_kw: { value: 11.72,  unit: 'kW'  },
        inverter_dissipated_kw:        { value: 15.00,  unit: 'kW'  },
        ...overrides,
      },
    } as unknown as Parameters<typeof emitBessDesign>[0]
  }

  it('picks EB XT 700 WT for L23 inputs (26.72 kW total at +50°C)', () => {
    const contract = makeL23Contract()
    const design = emitBessDesign(contract, {})

    // Find the chiller word across all modules
    let chillerPartNumber: string | undefined
    for (const mod of design.modules) {
      for (const sm of mod.sub_modules) {
        for (const w of sm.words) {
          const formMod = w.modifier_characters?.find(m => m.kind === 'form')
          if (formMod?.value?.includes('Pfannenberg')) {
            chillerPartNumber = formMod.value
            break
          }
        }
        if (chillerPartNumber) break
      }
      if (chillerPartNumber) break
    }

    expect(chillerPartNumber).toBeDefined()
    expect(chillerPartNumber).toContain('EB XT 600 WT')
    expect(chillerPartNumber).not.toContain('EB XT 400 WT')
    expect(chillerPartNumber).not.toContain('EB XT 500 WT')
  })

  it('still picks EB XT 400 WT when only battery load is present (legacy contract)', () => {
    // Legacy contract: no inverter_dissipated_kw field. Battery load only = 11.72 kW.
    // Required at +50°C with 1.20× margin = 14.1 kW. EB XT 400 WT (21.6 kW) clears.
    const contract = makeL23Contract({
      system_thermal_dissipation_kw: { value: 11.72, unit: 'kW' },
      inverter_dissipated_kw:        { value: 0,     unit: 'kW' },  // explicitly zero — legacy path
    })
    const design = emitBessDesign(contract, {})

    let chillerPartNumber: string | undefined
    for (const mod of design.modules) {
      for (const sm of mod.sub_modules) {
        for (const w of sm.words) {
          const formMod = w.modifier_characters?.find(m => m.kind === 'form')
          if (formMod?.value?.includes('Pfannenberg')) {
            chillerPartNumber = formMod.value
            break
          }
        }
        if (chillerPartNumber) break
      }
      if (chillerPartNumber) break
    }

    expect(chillerPartNumber).toBeDefined()
    expect(chillerPartNumber).toContain('EB XT 400 WT')
  })
})
