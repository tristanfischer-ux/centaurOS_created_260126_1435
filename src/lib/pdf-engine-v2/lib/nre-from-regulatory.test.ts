import { computeNreFromRegulatory, type NreBreakdown } from './nre-from-regulatory'

describe('computeNreFromRegulatory', () => {

  // ── Case 1: BESS with full regulatory matrix ──────────────────────────────
  // Should produce high NRE (£260k–£500k range) by summing UL 9540A, G99,
  // IEC 62619, BS EN 61439, and EN 55032.

  describe('BESS with full regulatory matrix', () => {
    const bessRegulatory = [
      { code: 'UL 9540A', name: 'UL 9540A', summary: 'Fire and thermal-runaway propagation test for BESS' },
      { code: 'G99', name: 'G99 Issue 6', summary: 'UK DNO grid-connection compliance' },
      { code: 'IEC 62619', name: 'IEC 62619', summary: 'Secondary lithium cells and batteries safety' },
      { code: 'BS EN 61439', name: 'BS EN 61439', summary: 'LV switchgear and controlgear assemblies' },
      { code: 'EN 55032', name: 'EN 55032', summary: 'EMC — emissions from multimedia equipment' },
    ]

    let result: NreBreakdown

    beforeAll(() => {
      result = computeNreFromRegulatory(bessRegulatory, 'battery_energy_storage')
    })

    it('uses regulatory_sum method', () => {
      expect(result.method).toBe('regulatory_sum')
    })

    it('produces NRE in the £260k–£500k range', () => {
      // UL 9540A £100k + G99 £60k + IEC 62619 £40k + BS EN 61439 £50k + EN 55032 £5.5k = £255.5k
      expect(result.totalGbp).toBeGreaterThanOrEqual(250_000)
      expect(result.totalGbp).toBeLessThanOrEqual(300_000)
    })

    it('sums to the expected total', () => {
      // 100000 + 60000 + 40000 + 50000 + 5500 = 255500
      expect(result.totalGbp).toBe(255_500)
    })

    it('programme duration equals the longest single certification', () => {
      // G99 = 20 weeks is the longest
      expect(result.totalWeeks).toBe(20)
    })

    it('produces one line item per regulatory entry', () => {
      expect(result.items).toHaveLength(5)
    })

    it('each item is sourced from regulatory_matrix', () => {
      for (const item of result.items) {
        expect(item.source).toBe('regulatory_matrix')
      }
    })

    it('matches UL 9540A correctly', () => {
      const ul = result.items.find(i => i.standardCode === 'UL 9540A')!
      expect(ul.estimatedCostGbp).toBe(100_000)
      expect(ul.estimatedDurationWeeks).toBe(16)
    })

    it('matches G99 correctly', () => {
      const g99 = result.items.find(i => i.standardCode === 'G99')!
      expect(g99.estimatedCostGbp).toBe(60_000)
      expect(g99.estimatedDurationWeeks).toBe(20)
    })
  })

  // ── Case 2: Drone with partial regulatory matrix ──────────────────────────
  // Mix of recognised aviation standards and generic entries.

  describe('drone with partial regulatory matrix', () => {
    const droneRegulatory = [
      { code: 'EASA SC-HAPS', name: 'EASA Special Condition HAPS', summary: 'High-altitude pseudo-satellite airworthiness' },
      { code: 'DO-160', name: 'DO-160G', summary: 'Environmental conditions and test procedures' },
      { name: 'C2 Link Frequency Approval', summary: 'Command and control radio link approval in target markets' },
    ]

    let result: NreBreakdown

    beforeAll(() => {
      result = computeNreFromRegulatory(droneRegulatory, 'aerospace')
    })

    it('uses regulatory_sum method', () => {
      expect(result.method).toBe('regulatory_sum')
    })

    it('includes the EASA special condition at £200k', () => {
      const easa = result.items.find(i => i.standardCode === 'EASA SC-HAPS')!
      expect(easa.estimatedCostGbp).toBe(200_000)
      expect(easa.estimatedDurationWeeks).toBe(24)
    })

    it('includes DO-160 at £60k', () => {
      const do160 = result.items.find(i => i.standardCode === 'DO-160')!
      expect(do160.estimatedCostGbp).toBe(60_000)
      expect(do160.estimatedDurationWeeks).toBe(20)
    })

    it('falls back to generic default for the unrecognised link approval entry', () => {
      const link = result.items.find(i => i.standardCode === 'C2 Link Frequency Approval')!
      expect(link.estimatedCostGbp).toBe(15_000)
      expect(link.estimatedDurationWeeks).toBe(6)
      expect(link.source).toBe('regulatory_matrix')
    })

    it('total is the sum of all three items', () => {
      // 200000 + 60000 + 15000 = 275000
      expect(result.totalGbp).toBe(275_000)
    })

    it('programme duration is the longest (EASA at 24 weeks)', () => {
      expect(result.totalWeeks).toBe(24)
    })
  })

  // ── Case 3: Empty regulatory returns flat estimate ─────────────────────────

  describe('empty regulatory array falls back to flat estimate', () => {
    it('returns flat_estimate method for empty array', () => {
      const result = computeNreFromRegulatory([], 'battery_energy_storage')
      expect(result.method).toBe('flat_estimate')
    })

    it('returns BESS-specific flat estimate (£260k)', () => {
      const result = computeNreFromRegulatory([], 'battery_energy_storage')
      expect(result.totalGbp).toBe(260_000)
      expect(result.totalWeeks).toBe(20)
    })

    it('returns aerospace flat estimate (£300k)', () => {
      const result = computeNreFromRegulatory([], 'aerospace')
      expect(result.totalGbp).toBe(300_000)
      expect(result.totalWeeks).toBe(32)
    })

    it('returns default flat estimate for unknown product class', () => {
      const result = computeNreFromRegulatory([], 'unknown_widget')
      expect(result.totalGbp).toBe(50_000)
      expect(result.totalWeeks).toBe(12)
    })

    it('includes a single default line item', () => {
      const result = computeNreFromRegulatory([], 'heat_pump')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].source).toBe('default')
    })

    it('treats nullish input the same as empty array', () => {
      const result = computeNreFromRegulatory(null as unknown as [], 'vertical_farm')
      expect(result.method).toBe('flat_estimate')
      expect(result.totalGbp).toBe(25_000)
    })
  })

  // ── Case 4: Thermal system with known standards ───────────────────────────

  describe('thermal system (heat pump) with known standards', () => {
    const thermalRegulatory = [
      { code: 'EN 378', name: 'EN 378', summary: 'Refrigerating systems and heat pumps — safety' },
      { code: 'EN 14825', name: 'EN 14825', summary: 'Air conditioners and heat pumps — seasonal efficiency' },
      { code: 'PED', name: 'Pressure Equipment Directive', summary: 'Directive 2014/68/EU' },
      { code: 'MCS MIS 3005', name: 'MCS 3005', summary: 'Heat pump installation standard' },
      { code: 'F-Gas', name: 'F-Gas Regulation', summary: 'EU 517/2014 fluorinated greenhouse gases' },
    ]

    let result: NreBreakdown

    beforeAll(() => {
      result = computeNreFromRegulatory(thermalRegulatory, 'heat_pump')
    })

    it('uses regulatory_sum method', () => {
      expect(result.method).toBe('regulatory_sum')
    })

    it('matches all five standards', () => {
      expect(result.items).toHaveLength(5)
    })

    it('EN 378 at £20k', () => {
      const en378 = result.items.find(i => i.standardCode === 'EN 378')!
      expect(en378.estimatedCostGbp).toBe(20_000)
      expect(en378.estimatedDurationWeeks).toBe(8)
    })

    it('EN 14825 at £35k', () => {
      const en14825 = result.items.find(i => i.standardCode === 'EN 14825')!
      expect(en14825.estimatedCostGbp).toBe(35_000)
      expect(en14825.estimatedDurationWeeks).toBe(10)
    })

    it('PED at £12k', () => {
      const ped = result.items.find(i => i.standardCode === 'PED')!
      expect(ped.estimatedCostGbp).toBe(12_000)
      expect(ped.estimatedDurationWeeks).toBe(6)
    })

    it('MCS at £15k', () => {
      const mcs = result.items.find(i => i.standardCode === 'MCS MIS 3005')!
      expect(mcs.estimatedCostGbp).toBe(15_000)
      expect(mcs.estimatedDurationWeeks).toBe(8)
    })

    it('F-Gas at £4k', () => {
      const fgas = result.items.find(i => i.standardCode === 'F-Gas')!
      expect(fgas.estimatedCostGbp).toBe(4_000)
      expect(fgas.estimatedDurationWeeks).toBe(2)
    })

    it('total = 20k + 35k + 12k + 15k + 4k = £86k', () => {
      expect(result.totalGbp).toBe(86_000)
    })

    it('programme duration is EN 14825 at 10 weeks (longest)', () => {
      expect(result.totalWeeks).toBe(10)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles entries with empty code and name gracefully', () => {
      const result = computeNreFromRegulatory(
        [{ code: '', name: '', summary: 'Some regulatory requirement' }],
        'default',
      )
      expect(result.method).toBe('regulatory_sum')
      expect(result.items).toHaveLength(1)
      expect(result.items[0].estimatedCostGbp).toBe(15_000) // generic default
    })

    it('handles case-insensitive matching', () => {
      const result = computeNreFromRegulatory(
        [{ code: 'ul 9540a', name: '' }],
        'default',
      )
      expect(result.items[0].estimatedCostGbp).toBe(100_000)
    })

    it('handles whitespace-padded codes', () => {
      const result = computeNreFromRegulatory(
        [{ code: '  G99  ', name: '' }],
        'default',
      )
      expect(result.items[0].estimatedCostGbp).toBe(60_000)
    })

    it('does not duplicate items for the same standard', () => {
      // Two entries for the same standard should produce two items (one per entry).
      const result = computeNreFromRegulatory(
        [
          { code: 'UL 9540A', name: 'UL 9540A' },
          { code: 'UL 9540A', name: 'UL 9540A duplicate' },
        ],
        'default',
      )
      expect(result.items).toHaveLength(2)
      expect(result.totalGbp).toBe(200_000)
    })

    it('category fallback works when no specific standard matches', () => {
      const result = computeNreFromRegulatory(
        [{ name: 'Marine vessel classification', summary: 'DNV GL rules for floating BESS' }],
        'default',
      )
      // Should match the maritime category via summary keyword
      expect(result.items[0].estimatedCostGbp).toBe(35_000)
      expect(result.items[0].standardName).toBe('Maritime classification')
    })
  })
})
