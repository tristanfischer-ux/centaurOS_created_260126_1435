/**
 * @file deterministic-emitter-wave-c.test.ts
 *
 * Regression guard for BESS WAVE C (2026-07-04), four genuine engine
 * defects found on out/bess-campaign-v2 (1500V-nominal / 2.5 MW / 13-rack
 * BESS): the 1500V protection/monitoring family, PCS undersizing, and
 * chiller undersizing. (Item 2, the cold-plate manifold "6 per rack" gate-26
 * finding, was investigated and found to be a FALSE POSITIVE in
 * src/lib/pdf-engine-v2/lib/per-rack-quantity-audit.ts — the regex matched
 * the trailing "6" in the "6061-T6" aluminium alloy grade, not a genuine
 * per-rack multiplier. No emitter change was made for item 2; see the WAVE C
 * verification report.)
 */

import {
  emitBessDesign,
  selectPfannenbergEbXt,
} from '../../../scripts/lib/deterministic-emitter'
import {
  auditVoltageSizing,
  VOLTAGE_SIZING_RULES,
} from '../../../scripts/lib/sizing-vs-design-audit'

function makeContract(overrides: Record<string, { value: number; unit: string }> = {}) {
  return {
    product_class: 'bess',
    quantities: {
      cell_count: { value: 6084, unit: '' },
      rack_count: { value: 13, unit: '' },
      cells_per_rack: { value: 468, unit: '' },
      series_cells_per_string: { value: 468, unit: '' },
      parallel_strings_per_rack: { value: 1, unit: '' },
      parallel_strings_total: { value: 13, unit: '' },
      cell_voltage_v: { value: 3.2, unit: 'V' },
      string_voltage_nominal_v: { value: 1497.6, unit: 'V' },
      thermal_rejection_min_kw: { value: 75, unit: 'kW' },
      continuous_power_kw: { value: 2500, unit: 'kW' },
      peak_power_kw: { value: 3125, unit: 'kW' },
      nameplate_capacity_kwh: { value: 5451.3, unit: 'kWh' },
      usable_capacity_kwh: { value: 4361, unit: 'kWh' },
      dod_fraction: { value: 0.80, unit: '' },
      dc_bus_voltage_v: { value: 1500, unit: 'V' },
      bus_continuous_current_a: { value: 1666.67, unit: 'A' },
      bus_peak_current_a: { value: 2083.33, unit: 'A' },
      string_continuous_current_a: { value: 128.2, unit: 'A' },
      string_peak_current_a: { value: 160.26, unit: 'A' },
      cell_capacity_ah: { value: 280, unit: 'Ah' },
      ambient_design_temp_c: { value: 45, unit: '°C' },
      system_thermal_dissipation_kw: { value: 95, unit: 'kW' },
      inverter_dissipated_kw: { value: 37.5, unit: 'kW' },
      ...overrides,
    },
  } as unknown as Parameters<typeof emitBessDesign>[0]
}

function findWord(design: ReturnType<typeof emitBessDesign>, wordId: string) {
  for (const m of design.modules) {
    for (const sm of m.sub_modules) {
      for (const w of sm.words) {
        if (w.id === wordId) return w
      }
    }
  }
  return undefined
}

function modVal(word: any, kind: string): string | undefined {
  return word?.modifier_characters?.find((mc: any) => mc.kind === kind)?.value
}

describe('BESS WAVE C item 1 — 1500V family', () => {
  const design = emitBessDesign(makeContract(), {})

  it('insulation monitor: Bender isoPV1685 (1500V), not iso685-D-B (1000V)', () => {
    const w = findWord(design, 'insulation_monitor_word')
    expect(modVal(w, 'part_number')).toBe('isoPV1685')
    expect(modVal(w, 'dimension')).toBe('1500')
  })

  it('DC-bus voltage transducer: LEM DVL 2000, not LV 25-1000', () => {
    const w = findWord(design, 'pack_voltage_sensor_word')
    expect(modVal(w, 'part_number')).toBe('DVL 2000')
  })

  it('rack DC isolator: ABB OTDC…FV11-ESS (1500V, real 315A+ steps), not OTDC…E02P (1000V)', () => {
    const w = findWord(design, 'rack_dc_isolator_word')
    expect(modVal(w, 'part_number')).toMatch(/^OTDC\d+FV11-ESS$/)
    expect(Number(modVal(w, 'part_number')!.match(/\d+/)![0])).toBeGreaterThanOrEqual(315)
  })

  it('DC HRC fuse: real Eaton Bussmann 1500V bolt-in PV fuse, not PV-200ANH1 (1000V)', () => {
    const w = findWord(design, 'dc_hrc_fuse_word')
    expect(modVal(w, 'part_number')).toMatch(/^PV-\d+A-(1XL|2XL|3L)-B?-?15$/)
  })

  it('fuse dedup: rack_string_fuse_word no longer exists (2026-07-05 dedup — the rack/string DC fuse is listed exactly once, under power_distribution as dc_hrc_fuse_word)', () => {
    expect(findWord(design, 'rack_string_fuse_word')).toBeUndefined()
  })

  it('below 1000V nominal, the ORIGINAL 1000V-class parts are unchanged (byte-identical for non-1500V briefs)', () => {
    const lowVDesign = emitBessDesign(
      makeContract({ dc_bus_voltage_v: { value: 800, unit: 'V' } }),
      {},
    )
    const iso = findWord(lowVDesign, 'insulation_monitor_word')
    expect(modVal(iso, 'part_number')).toBe('iso685-D-B')
    const lem = findWord(lowVDesign, 'pack_voltage_sensor_word')
    expect(modVal(lem, 'part_number')).toBe('LV 25-1000')
  })

  it('gate-6 voltage-sizing extension: zero HIGH findings on the fixed design', () => {
    const fakeState = { moduleDecomposition: { modules: design.modules, product_class: 'energy_storage' }, orchestratorContract: { quantities: makeContract().quantities } }
    const result = auditVoltageSizing(fakeState)
    expect(result.findings).toHaveLength(0)
    expect(result.words_matched_to_rule).toBeGreaterThan(0)
  })

  it('gate-6 voltage-sizing extension proveCatch: fires HIGH on a synthetic pre-fix 1000V part', () => {
    const badDesign = JSON.parse(JSON.stringify(design))
    for (const m of badDesign.modules) {
      for (const sm of m.sub_modules) {
        for (const w of sm.words) {
          if (w.id === 'insulation_monitor_word') {
            w.modifier_characters = w.modifier_characters.map((mc: any) =>
              mc.kind === 'dimension' ? { ...mc, value: '1000', unit: 'V' } : mc,
            )
          }
        }
      }
    }
    const fakeState = { moduleDecomposition: { modules: badDesign.modules, product_class: 'energy_storage' }, orchestratorContract: { quantities: makeContract().quantities } }
    const result = auditVoltageSizing(fakeState)
    expect(result.findings.length).toBeGreaterThanOrEqual(1)
    expect(result.findings[0].severity).toBe('HIGH')
  })

  it('VOLTAGE_SIZING_RULES table is non-empty (regression: the rule must exist)', () => {
    expect(VOLTAGE_SIZING_RULES.length).toBeGreaterThan(0)
  })
})

describe('BESS WAVE C item 1 follow-up — rack fuse ampacity (v4 physics-critic HIGH #1, 2026-07-05)', () => {
  // out/bess-campaign-v4 contract: continuous_power_kw=2500, dc_bus_voltage_v=1500,
  // rack_count=13 -> bus_continuous_current_a=1666.67, string_continuous_current_a=128.2.
  // Arithmetic: 128.2 x 1.25 = 160.25 A required; next standard gPV step >= that
  // in BUSSMANN_PV_1500V_RANGE is 200 A (160 A falls 0.25 A short) -> PV-200A-1XL-B-15.
  const design = emitBessDesign(makeContract(), {})

  it('rack/string DC fuse (dc_hrc_fuse_word, power_distribution — canonical since the 2026-07-05 dedup): PV-200A-1XL-B-15 at 200 A clears 1.25x rack-current floor (1.56x actual margin) — the v4 critic finding was a false positive', () => {
    const w = findWord(design, 'dc_hrc_fuse_word')
    expect(modVal(w, 'part_number')).toBe('PV-200A-1XL-B-15')
    expect(modVal(w, 'capacity')).toBe('200')
  })

  it('gate-6 ampacity leg: zero HIGH findings on the real v4-shaped design (confirms 200 A is NOT undersized)', () => {
    const fakeState = { moduleDecomposition: { modules: design.modules, product_class: 'energy_storage' }, orchestratorContract: { quantities: makeContract().quantities } }
    const result = auditVoltageSizing(fakeState)
    const ampacityFindings = result.findings.filter((f) => f.check === 'ampacity')
    expect(ampacityFindings).toHaveLength(0)
  })

  it('gate-6 ampacity leg proveCatch: fires HIGH when the rack/string DC fuse is rated below 1.25x string_continuous_current_a', () => {
    const badDesign = JSON.parse(JSON.stringify(design))
    for (const m of badDesign.modules) {
      for (const sm of m.sub_modules) {
        for (const w of sm.words) {
          if (w.id === 'dc_hrc_fuse_word') {
            // 100 A on a 128.2 A rack (required 160.25 A) — genuinely undersized.
            w.modifier_characters = w.modifier_characters.map((mc: any) =>
              mc.kind === 'capacity' ? { ...mc, value: '100' } : mc,
            )
          }
        }
      }
    }
    const fakeState = { moduleDecomposition: { modules: badDesign.modules, product_class: 'energy_storage' }, orchestratorContract: { quantities: makeContract().quantities } }
    const result = auditVoltageSizing(fakeState)
    const ampacityFindings = result.findings.filter((f) => f.check === 'ampacity' && f.word_id === 'dc_hrc_fuse_word')
    expect(ampacityFindings.length).toBeGreaterThanOrEqual(1)
    expect(ampacityFindings[0].severity).toBe('HIGH')
    expect(ampacityFindings[0].claimed_a).toBe(100)
    expect(ampacityFindings[0].required_a).toBeCloseTo(160.25, 1)
  })

  it('fuse dedup (2026-07-05): dc_hrc_fuse_word is the ONLY rack/string DC fuse word in the whole design — no duplicate priced line under safety_protection', () => {
    const fuseWords: any[] = []
    for (const m of design.modules) {
      for (const sm of m.sub_modules) {
        for (const w of sm.words) {
          if (w.id === 'dc_hrc_fuse_word' || w.id === 'rack_string_fuse_word') fuseWords.push(`${m.module}:${w.id}`)
        }
      }
    }
    expect(fuseWords).toEqual(['power_distribution:dc_hrc_fuse_word'])
  })

  it('below 1000V nominal, the rack/string DC fuse is current-derived (not a stale hardcoded 200 A literal) — PV-ANH1/ANH2 family', () => {
    // out/bess-campaign-v4 shape but a much higher rack current, forcing the
    // ≤1000V branch off the old hardcoded 200 A literal: string_continuous_
    // current_a = 600 A -> required = 600 x 1.25 = 750 A -> PV-630ANH2 is the
    // largest catalogued step (saturates, per selectBessDcFuse1000V's
    // fallback) rather than the stale PV-200ANH1.
    const highCurrentDesign = emitBessDesign(
      makeContract({
        dc_bus_voltage_v: { value: 800, unit: 'V' },
        string_continuous_current_a: { value: 600, unit: 'A' },
      }),
      {},
    )
    const w = findWord(highCurrentDesign, 'dc_hrc_fuse_word')
    expect(modVal(w, 'part_number')).not.toBe('PV-200ANH1')
    expect(modVal(w, 'part_number')).toBe('PV-630ANH2')
    expect(modVal(w, 'dimension')).toBe('1000')
  })

  it('rejects the shadow-autocorrect fuse pick: "PV-315A-2XL-B-15" is not a real body-style/rating combination the emitter would ever choose', () => {
    // The 315 A step in BUSSMANN_PV_1500V_RANGE is body style 3L (PV-315A-3L-15);
    // 2XL-B only exists at the 160 A step. The emitter must never produce the
    // fabricated combination the physics-critic-autocorrect shadow record proposed.
    for (const m of design.modules) {
      for (const sm of m.sub_modules) {
        for (const w of sm.words) {
          const pn = modVal(w, 'part_number')
          if (pn) expect(pn).not.toBe('PV-315A-2XL-B-15')
        }
      }
    }
  })
})

describe('BESS WAVE C item 2 — duplicate coolant circulation pump listing (v4 physics-critic MED, 2026-07-05)', () => {
  const design = emitBessDesign(makeContract(), {})

  function findWords(wordId: string) {
    const hits: any[] = []
    for (const m of design.modules) {
      for (const sm of m.sub_modules) {
        for (const w of sm.words) {
          if (w.id === wordId) hits.push(w)
        }
      }
    }
    return hits
  }

  it('the circulation pump word exists exactly once, in environmental_interface (not duplicated into mass_fluid_transport_process)', () => {
    expect(findWords('cooling_pump_word')).toHaveLength(1)
    expect(findWords('coolant_circulation_pump_word')).toHaveLength(0)
    const owningModule = design.modules.find((m: any) => m.sub_modules.some((sm: any) => sm.words.some((w: any) => w.id === 'cooling_pump_word')))
    expect(owningModule?.module).toBe('environmental_interface')
  })

  it('no Grundfos pump part number appears more than once across the whole design (the general dedup invariant)', () => {
    const pumpPartNumbers: string[] = []
    for (const m of design.modules) {
      for (const sm of m.sub_modules) {
        for (const w of sm.words) {
          const mfr = modVal(w, 'manufacturer')
          const pn = modVal(w, 'part_number')
          if (mfr === 'Grundfos' && pn) pumpPartNumbers.push(`${m.module}:${w.id}:${pn}`)
        }
      }
    }
    const byPn: Record<string, number> = {}
    for (const entry of pumpPartNumbers) {
      const pn = entry.split(':')[2]
      byPn[pn] = (byPn[pn] ?? 0) + 1
    }
    const duplicated = Object.entries(byPn).filter(([, count]) => count > 1)
    expect(duplicated).toEqual([])
  })
})

describe('BESS WAVE C item 3 — PCS undersizing', () => {
  it('2.5 MW brief: PCS quantity = ceil(2500/1000) = 3, not 1', () => {
    const design = emitBessDesign(makeContract(), {})
    const w = findWord(design, 'pcs_inverter_1mw_bidirectional_word')
    expect(modVal(w, 'quantity')).toBe('×3')
    expect(modVal(w, 'capacity')).toBe('1')
    expect(modVal(w, 'list_price_gbp')).toBe('75000')
  })

  it('aggregate PCS power (quantity × per-unit rating) meets the brief continuous power', () => {
    const design = emitBessDesign(makeContract(), {})
    const w = findWord(design, 'pcs_inverter_1mw_bidirectional_word')
    const qty = Number(modVal(w, 'quantity')!.replace('×', ''))
    const unitMw = Number(modVal(w, 'capacity'))
    expect(qty * unitMw).toBeGreaterThanOrEqual(2.5)
  })

  it('1 MW brief: PCS quantity stays 1 (no-op for a correctly-sized brief)', () => {
    const design = emitBessDesign(makeContract({ continuous_power_kw: { value: 1000, unit: 'kW' } }), {})
    const w = findWord(design, 'pcs_inverter_1mw_bidirectional_word')
    expect(modVal(w, 'quantity')).toBe('×1')
  })
})

describe('BESS WAVE C item 4 — chiller undersizing', () => {
  it('saturated case (159 kW required > 148 kW single-unit max): deploys 2 units, aggregate clears the load', () => {
    // Reproduces the AUDIT-THERMAL.md MED finding inputs: 132.5 kW load,
    // 1.2x margin = 159 kW required, +45C ambient (EB XT 1600 WT derates to
    // 108.5 kW there — insufficient alone).
    const design = emitBessDesign(
      makeContract({
        system_thermal_dissipation_kw: { value: 95, unit: 'kW' },
        inverter_dissipated_kw: { value: 37.5, unit: 'kW' },
        ambient_design_temp_c: { value: 45, unit: '°C' },
      }),
      {},
    )
    const w = findWord(design, 'liquid_cooling_chiller_word')
    const qty = Number(modVal(w, 'quantity')!.replace('×', ''))
    expect(qty).toBeGreaterThanOrEqual(2)
    const selected = selectPfannenbergEbXt(132.5 * 1.20, 45)
    expect(qty * selected.derated_capacity_kw).toBeGreaterThanOrEqual(132.5 * 1.20)
  })

  it('non-saturated case: quantity stays 1 (no-op for every previously-passing design)', () => {
    const design = emitBessDesign(
      makeContract({
        system_thermal_dissipation_kw: { value: 11.72, unit: 'kW' },
        inverter_dissipated_kw: { value: 15, unit: 'kW' },
        ambient_design_temp_c: { value: 50, unit: '°C' },
      }),
      {},
    )
    const w = findWord(design, 'liquid_cooling_chiller_word')
    expect(modVal(w, 'quantity')).toBe('×1')
  })

  it('selectPfannenbergEbXt itself is UNCHANGED (still saturates to EB XT 1600 WT — see deterministic-emitter-chiller.test.ts)', () => {
    const result = selectPfannenbergEbXt(159.0, 45)
    expect(result.part_number).toBe('EB XT 1600 WT')
  })
})

describe('BESS WAVE C — determinism', () => {
  it('two emitBessDesign replays are byte-identical', () => {
    const contract = makeContract()
    const a = emitBessDesign(contract, {})
    const b = emitBessDesign(contract, {})
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
