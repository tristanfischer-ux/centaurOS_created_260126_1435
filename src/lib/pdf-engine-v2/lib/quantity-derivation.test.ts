import {
  deriveQuantities,
  applyOverrides,
  type PartLike,
  type BomLineLike,
} from './quantity-derivation'
import type { ProductSpecs } from './spec-extraction'

// Canonical BESS specs matching the bess.md brief.
const bessSpecs: ProductSpecs = {
  capacityKwh: 3500,
  powerKw: 1000,
  voltageV: 800,
  cellVoltageV: 3.2,
  cellCapacityAh: 280,
  dod: 0.8,
  massKg: 28000,
  batchSize: 25,
}

// Canonical heat-pump specs.
const heatPumpSpecs: ProductSpecs = {
  powerKw: 30,
  massKg: 180,
  batchSize: 500,
}

// Canonical vertical-farm specs.
const farmSpecs: ProductSpecs = {
  growingAreaM2: 12,
  tiers: 6,
  trayCount: 60,
  trayAreaM2: 1.2,
  batchSize: 100,
}

describe('quantity-derivation', () => {
  describe('BESS rules', () => {
    it('derives ~4,864 cells for a 3.5 MWh BESS at 80 % DoD', () => {
      const parts: PartLike[] = [
        { partNumber: 'BESS-CELL-001', name: 'CATL 280 Ah LFP Prismatic Cell' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'BESS-CELL-001', quantity: 272 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].rule).toBe('bess_cell_count')
      // 3500 / 0.8 = 4375 nominal; 4375 × 1000 / (3.2 × 280) = 4882
      // rounded up to 16-multiple = 4896. Accept 4864-4896 (16-string bucket).
      expect(overrides[0].newQty).toBeGreaterThanOrEqual(4864)
      expect(overrides[0].newQty).toBeLessThanOrEqual(4912)
      expect(overrides[0].oldQty).toBe(272)
      expect(overrides[0].confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('derives rack count = 1 per 250 kWh nominal', () => {
      const parts: PartLike[] = [
        { partNumber: 'BESS-RACK-001', name: 'Battery rack assembly' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'BESS-RACK-001', quantity: 6 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].rule).toBe('bess_rack_count')
      // 4375 / 250 = 17.5 → 18 racks
      expect(overrides[0].newQty).toBe(18)
    })

    it('derives BMS slaves = 1 per rack (18 racks → 18 slaves)', () => {
      const parts: PartLike[] = [
        { partNumber: 'BMS-SLV-001', name: 'BMS Slave module control unit' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'BMS-SLV-001', quantity: 1 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(18)
      expect(overrides[0].rule).toBe('bess_bms_slave_per_rack')
    })

    it('derives BMS master = 1 per system (regardless of LLM guess)', () => {
      const parts: PartLike[] = [
        { partNumber: 'BMS-MST-001', name: 'BMS Master controller' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'BMS-MST-001', quantity: 18 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(1)
      expect(overrides[0].rule).toBe('bess_bms_master_per_system')
    })

    it('derives PCS = 1 per system', () => {
      const parts: PartLike[] = [
        { partNumber: 'PCS-001', name: '1 MW PCS (Power Conversion System)' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'PCS-001', quantity: 4 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(1)
    })

    it('derives container = 1 per system', () => {
      const parts: PartLike[] = [
        { partNumber: 'CNTR-001', name: '40-foot ISO container' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'CNTR-001', quantity: 2 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(1)
    })

    it('does NOT fire BESS rules for a heat-pump product class', () => {
      const parts: PartLike[] = [
        { partNumber: 'P1', name: 'CATL 280 Ah LFP Prismatic Cell' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'P1', quantity: 272 }]

      const overrides = deriveQuantities(heatPumpSpecs, 'heat_pump', parts, bomLines)
      expect(overrides).toHaveLength(0)
    })

    it('skips override when new qty equals old qty', () => {
      const parts: PartLike[] = [
        { partNumber: 'BMS-MST-001', name: 'BMS Master' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'BMS-MST-001', quantity: 1 }]

      const overrides = deriveQuantities(bessSpecs, 'battery_energy_storage', parts, bomLines)
      expect(overrides).toHaveLength(0) // already correct
    })
  })

  describe('Heat pump rules', () => {
    it('derives 1 compressor per monobloc', () => {
      const parts: PartLike[] = [
        { partNumber: 'CMP-001', name: 'Scroll compressor R290' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'CMP-001', quantity: 2 }]

      const overrides = deriveQuantities(heatPumpSpecs, 'heat_pump', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(1)
    })

    it('also fires on the thermal_system classifier label', () => {
      // product-classifier.ts emits "thermal_system", not "heat_pump", for
      // HP briefs — the derivation must accept both.
      const parts: PartLike[] = [
        { partNumber: 'CMP-001', name: 'Scroll compressor R290' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'CMP-001', quantity: 2 }]

      const overrides = deriveQuantities(heatPumpSpecs, 'thermal_system', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(1)
    })

    it('derives 2 fans for a 30 kW unit', () => {
      const parts: PartLike[] = [
        { partNumber: 'FAN-001', name: 'Axial fan assembly' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'FAN-001', quantity: 1 }]

      const overrides = deriveQuantities(heatPumpSpecs, 'heat_pump', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(2)
    })

    it('derives 1 fan for a small 8 kW unit', () => {
      const parts: PartLike[] = [
        { partNumber: 'FAN-001', name: 'Axial fan assembly' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'FAN-001', quantity: 3 }]

      const overrides = deriveQuantities({ powerKw: 8 }, 'heat_pump', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(1)
    })
  })

  describe('Vertical farm rules', () => {
    it('derives 60 LED panels for a 60-tray farm', () => {
      const parts: PartLike[] = [
        { partNumber: 'LED-001', name: 'Horticultural LED grow panel' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'LED-001', quantity: 6 }]

      const overrides = deriveQuantities(farmSpecs, 'vertical_farm', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(60)
    })

    it('derives 60 trays for a 60-tray farm', () => {
      const parts: PartLike[] = [
        { partNumber: 'TRAY-001', name: 'DWC growing tray' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'TRAY-001', quantity: 10 }]

      const overrides = deriveQuantities(farmSpecs, 'vertical_farm', parts, bomLines)

      expect(overrides).toHaveLength(1)
      expect(overrides[0].newQty).toBe(60)
    })
  })

  describe('applyOverrides', () => {
    it('replaces bomLine quantity and stamps qtySource flag', () => {
      const bomLines: BomLineLike[] = [
        { childPartId: 'BESS-CELL-001', quantity: 272 },
        { childPartId: 'OTHER-001', quantity: 42 },
      ]
      const overrides = [
        {
          partId: 'BESS-CELL-001',
          partNumber: 'BESS-CELL-001',
          partName: 'Cell',
          oldQty: 272,
          newQty: 4880,
          rule: 'bess_cell_count',
          confidence: 0.9,
          explanation: 'test',
        },
      ]
      const applied = applyOverrides(bomLines, overrides)

      expect(applied[0].quantity).toBe(4880)
      expect((applied[0] as any).qtySource).toBe('deterministic')
      expect((applied[0] as any).qtyRule).toBe('bess_cell_count')
      expect(applied[1].quantity).toBe(42) // untouched
      expect((applied[1] as any).qtySource).toBeUndefined()
    })
  })

  describe('confidence threshold', () => {
    it('rejects overrides below minConfidence=0.8', () => {
      // Heat pump fan has confidence 0.75 — should be rejected at 0.8.
      const parts: PartLike[] = [
        { partNumber: 'FAN-001', name: 'Axial fan assembly' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'FAN-001', quantity: 1 }]

      const overrides = deriveQuantities(heatPumpSpecs, 'heat_pump', parts, bomLines, 0.8)
      expect(overrides).toHaveLength(0)
    })
  })

  describe('missing specs', () => {
    it('returns no overrides when specs are empty', () => {
      const parts: PartLike[] = [
        { partNumber: 'BESS-CELL-001', name: 'CATL 280 Ah LFP Prismatic Cell' },
      ]
      const bomLines: BomLineLike[] = [{ childPartId: 'BESS-CELL-001', quantity: 272 }]

      const overrides = deriveQuantities({}, 'battery_energy_storage', parts, bomLines)
      // Cell rule needs capacityKwh; no other BESS rules match the cell
      // part. BMS master rule only fires on master parts. Container rule
      // only fires on container parts. So zero overrides here.
      expect(overrides).toHaveLength(0)
    })
  })
})
