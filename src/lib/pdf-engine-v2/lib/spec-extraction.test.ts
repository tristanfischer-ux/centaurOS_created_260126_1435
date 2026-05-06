import { extractSpecs, summariseSpecs } from './spec-extraction'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Load a brief file from src/lib/pdf-engine-v2/briefs/<name>.md
 * Tests run from project root via jest.
 */
function loadBrief(name: string): string {
  return readFileSync(
    join(__dirname, '..', 'briefs', `${name}.md`),
    'utf-8',
  )
}

describe('spec-extraction', () => {
  describe('extractSpecs — BESS brief', () => {
    const specs = extractSpecs(loadBrief('bess'))

    it('extracts 3,500 kWh capacity from "3.5 MWh"', () => {
      expect(specs.capacityKwh).toBe(3500)
    })

    it('extracts 1,000 kW power from "1 MW PCS"', () => {
      expect(specs.powerKw).toBe(1000)
    })

    it('extracts 800 V DC bus voltage', () => {
      // Brief mentions 800 V nominal and 400 V AC — max() picks bus.
      expect(specs.voltageV).toBe(800)
    })

    it('defaults cell voltage to 3.2 V for LFP chemistry', () => {
      expect(specs.cellVoltageV).toBe(3.2)
    })

    it('extracts 280 Ah cell capacity', () => {
      expect(specs.cellCapacityAh).toBe(280)
    })

    it('extracts 80 % depth of discharge', () => {
      expect(specs.dod).toBeCloseTo(0.8, 3)
    })

    it('extracts 28,000 kg gross mass limit', () => {
      expect(specs.massKg).toBe(28000)
    })

    it('extracts 12,192 × 2,438 × 2,896 mm envelope', () => {
      expect(specs.dimensionsMm).toEqual({ w: 12192, d: 2438, h: 2896 })
    })

    it('extracts annual batch 25', () => {
      expect(specs.batchSize).toBe(25)
    })
  })

  describe('extractSpecs — heat pump brief', () => {
    const specs = extractSpecs(loadBrief('heatpump'))

    it('extracts 30 kW heat output from "30 kW monobloc"', () => {
      expect(specs.powerKw).toBe(30)
    })

    it('extracts 180 kg target mass', () => {
      expect(specs.massKg).toBe(180)
    })

    it('extracts 1,100 × 450 × 1,300 mm envelope', () => {
      expect(specs.dimensionsMm).toEqual({ w: 1100, d: 450, h: 1300 })
    })

    it('extracts batch size 500 / year', () => {
      expect(specs.batchSize).toBe(500)
    })

    it('does not extract spurious capacityKwh (brief has no MWh / kWh rating)', () => {
      expect(specs.capacityKwh).toBeUndefined()
    })
  })

  describe('extractSpecs — vertical farm brief', () => {
    const specs = extractSpecs(loadBrief('farm'))

    it('extracts 12 m² growing footprint', () => {
      expect(specs.growingAreaM2).toBe(12)
    })

    it('extracts 6 vertical tiers', () => {
      expect(specs.tiers).toBe(6)
    })

    it('extracts 60 growing trays', () => {
      expect(specs.trayCount).toBe(60)
    })

    it('extracts 1.2 m² tray area from "each 1.2 × 1.0 m"', () => {
      expect(specs.trayAreaM2).toBeCloseTo(1.2, 3)
    })

    it('extracts 2,400 × 1,400 × 2,700 mm envelope', () => {
      expect(specs.dimensionsMm).toEqual({ w: 2400, d: 1400, h: 2700 })
    })

    it('extracts batch 100 / year', () => {
      expect(specs.batchSize).toBe(100)
    })
  })

  describe('extractSpecs — edge cases', () => {
    it('returns empty object for empty string', () => {
      expect(extractSpecs('')).toEqual({})
    })

    it('ignores control-circuit voltages below 100 V', () => {
      // 24 V control rail should not be picked up as system voltage.
      const specs = extractSpecs('Control circuit: 24 V DC')
      expect(specs.voltageV).toBeUndefined()
    })

    it('prefers MWh over kWh when both appear', () => {
      const specs = extractSpecs('System rated 3.5 MWh (equivalent to 3,500 kWh)')
      expect(specs.capacityKwh).toBe(3500)
    })

    it('prefers structured DesignBrief.batchSize over regex', () => {
      const specs = extractSpecs('Annual batch size: 25 units per year', {
        useCase: '',
        targetProcess: '',
        targetMaterial: '',
        toleranceTarget: '',
        quantityTarget: '',
        complianceNotes: '',
        constraints: { batchSize: 100 },
      })
      expect(specs.batchSize).toBe(100)
    })

    it('prefers structured DesignBrief.maxMassKg over regex', () => {
      const specs = extractSpecs('Mass ≤ 180 kg', {
        useCase: '',
        targetProcess: '',
        targetMaterial: '',
        toleranceTarget: '',
        quantityTarget: '',
        complianceNotes: '',
        constraints: { maxMassKg: 200 },
      })
      expect(specs.massKg).toBe(200)
    })

    it('defaults LFP cells to 3.2 V without explicit statement', () => {
      const specs = extractSpecs('LFP prismatic cells')
      expect(specs.cellVoltageV).toBe(3.2)
    })

    it('defaults NMC cells to 3.65 V', () => {
      const specs = extractSpecs('NMC pouch cells')
      expect(specs.cellVoltageV).toBe(3.65)
    })

    it('does not confuse MW with MWh for power extraction', () => {
      const specs = extractSpecs('1 MW PCS serving a 3.5 MWh battery')
      expect(specs.powerKw).toBe(1000)
      expect(specs.capacityKwh).toBe(3500)
    })
  })

  describe('summariseSpecs', () => {
    it('returns "(no specs extracted)" for empty specs', () => {
      expect(summariseSpecs({})).toBe('(no specs extracted)')
    })

    it('formats BESS specs as comma-separated summary', () => {
      const summary = summariseSpecs({
        capacityKwh: 3500,
        powerKw: 1000,
        voltageV: 800,
        cellVoltageV: 3.2,
        cellCapacityAh: 280,
        dod: 0.8,
      })
      expect(summary).toContain('3500 kWh')
      expect(summary).toContain('1000 kW')
      expect(summary).toContain('800 V bus')
      expect(summary).toContain('3.2 V × 280 Ah cells')
      expect(summary).toContain('80 % DoD')
    })
  })
})
