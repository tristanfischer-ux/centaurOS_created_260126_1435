import { checkCostFloors } from './cost-floor-check'

describe('checkCostFloors', () => {
  // ─── Rule 1: heavy part with implausibly low cost ─────────────────

  it('flags a heavy part (>10kg) with cost below £50', () => {
    const flags = checkCostFloors([
      { name: 'Shipping container bracket', estimatedUnitCostGbp: 18, massKg: 15 },
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].partName).toBe('Shipping container bracket')
    expect(flags[0].reason).toContain('Heavy part (15kg)')
    expect(flags[0].suggestedMin).toBe(50)
  })

  // ─── Rule 2: very heavy part with suspiciously low cost ──────────

  it('flags a very heavy part (>100kg) with cost below £200', () => {
    const flags = checkCostFloors([
      { name: 'Structural I-beam', estimatedUnitCostGbp: 80, massKg: 250 },
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].reason).toContain('Very heavy part (250kg)')
    expect(flags[0].suggestedMin).toBe(200)
  })

  // ─── Rule 3: CNC-machined part below minimum viable cost ─────────

  it('flags a CNC-machined part with cost below £5', () => {
    const flags = checkCostFloors([
      { name: 'CNC aluminium spacer', estimatedUnitCostGbp: 2.5, process: 'CNC_milling' },
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].reason).toContain('CNC-machined')
    expect(flags[0].suggestedMin).toBe(5)
  })

  // ─── Rule 4: injection-moulded part below tooling amortisation ────

  it('flags an injection-moulded part with cost below £2', () => {
    const flags = checkCostFloors([
      { name: 'Injection-moulded clip', estimatedUnitCostGbp: 0.8, process: 'injection_moulding' },
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].reason).toContain('Injection-moulded')
    expect(flags[0].suggestedMin).toBe(2)
  })

  // ─── Passing case: all costs are plausible ────────────────────────

  it('returns empty array when all costs are plausible', () => {
    const flags = checkCostFloors([
      { name: 'Steel enclosure', estimatedUnitCostGbp: 350, massKg: 25 },
      { name: 'CNC heatsink', estimatedUnitCostGbp: 45, process: 'CNC_milling' },
      { name: 'Injection-moulded housing', estimatedUnitCostGbp: 12, process: 'injection_moulding' },
      { name: 'PCB assembly', estimatedUnitCostGbp: 18 },
    ])
    expect(flags).toHaveLength(0)
  })
})
