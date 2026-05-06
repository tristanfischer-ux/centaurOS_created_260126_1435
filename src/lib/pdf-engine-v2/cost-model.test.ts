import { calculateCost, moduleCost, checkCostCeiling, formatGbp } from './cost-model';
import type { Part, BomLine, CostBreakdown } from './types';

describe('Cost Model', () => {
  const mockParts: Part[] = [
    { partNumber: 'MOD1-001', name: 'Motor', sourceModuleId: 'mod1', estimatedUnitCostGbp: 100, massKg: 2 },
    { partNumber: 'MOD1-002', name: 'Controller', sourceModuleId: 'mod1', estimatedUnitCostGbp: 50, massKg: 0.5 },
    { partNumber: 'MOD2-001', name: 'Sensor', sourceModuleId: 'mod2', estimatedUnitCostGbp: 20, massKg: 0.1 },
  ];

  // BomLines left empty = every part treated as qty=1 (legacy behaviour).
  const noLines: BomLine[] = []

  describe('moduleCost', () => {
    it('sums parts correctly for a given moduleId', () => {
      const cost = moduleCost(mockParts, noLines, 'mod1');
      expect(cost).toBe(150); // 100 + 50
    });

    it('returns 0 when no parts match the moduleId', () => {
      const cost = moduleCost(mockParts, noLines, 'non_existent_mod');
      expect(cost).toBe(0);
    });

    it('multiplies by BOM-line quantity when lines are provided', () => {
      const withQty: BomLine[] = [
        { childPartId: 'MOD1-001', quantity: 3 },
        { childPartId: 'MOD1-002', quantity: 2 },
      ];
      const cost = moduleCost(mockParts, withQty, 'mod1');
      expect(cost).toBe(100 * 3 + 50 * 2); // 400
    });
  });

  describe('calculateCost', () => {
    // Default domain 'hardware' isn't in DOMAIN_OVERHEAD so uses 'default':
    // multiplier=1.5, baseNre=5000 (after B1b change).
    it('groups parts by module, applies multiplier, calculates NRE', () => {
      const result = calculateCost(mockParts, noLines, 'hardware', 1000);

      expect(result.perModule.length).toBe(2);
      expect(result.perModule.find(m => m.moduleName === 'Module mod1')?.totalGbp).toBe(150 * 1.5); // 225
      expect(result.perModule.find(m => m.moduleName === 'Module mod2')?.totalGbp).toBe(20 * 1.5); // 30

      expect(result.unitTotalGbp).toBe(255); // 225 + 30
      // 2 modules × £5,000 default NRE per module (B1b: was 2 × 0.12 × 5000)
      expect(result.nreTotalGbp).toBe(10000);
    });

    it('uses "default" multiplier for unknown domains', () => {
      const result = calculateCost(mockParts, noLines, 'unknown_domain_xyz', null);

      expect(result.overheadMultiplier).toBe(1.5);
      expect(result.unitTotalGbp).toBe((150 + 20) * 1.5); // 255
      expect(result.nreTotalGbp).toBe(10000); // 2 × £5,000
    });

    it('handles empty parts array gracefully', () => {
      const result = calculateCost([], noLines, 'hardware', null);

      expect(result.perModule.length).toBe(0);
      expect(result.unitTotalGbp).toBe(0);
      expect(result.nreTotalGbp).toBe(0);
    });

    it('uses BOM-line quantities in unit cost roll-up', () => {
      const withQty: BomLine[] = [
        { childPartId: 'MOD1-001', quantity: 10 },
      ];
      const result = calculateCost(mockParts, withQty, 'unknown_domain_xyz', null);
      // mod1: (10 × 100) + (1 × 50) = 1050; × 1.5 = 1575
      // mod2: 1 × 20 × 1.5 = 30
      expect(result.unitTotalGbp).toBe(1575 + 30);
    });
  });

  describe('checkCostCeiling', () => {
    const mockBreakdown: CostBreakdown = {
      unitTotalGbp: 1500,
      ceilingGbp: 1000,
      perModule: [],
      overheadMultiplier: 1.5,
      nreTotalGbp: 0
    };

    it('returns null when no ceiling', () => {
      expect(checkCostCeiling({ ...mockBreakdown, ceilingGbp: null })).toBeNull();
      expect(checkCostCeiling({ ...mockBreakdown, ceilingGbp: 0 })).toBeNull();
    });

    it('detects when cost exceeds ceiling with correct gap percentage', () => {
      const result = checkCostCeiling(mockBreakdown);
      expect(result).not.toBeNull();
      expect(result?.exceeds).toBe(true);
      expect(result?.gapPct).toBe(50); // (1500 - 1000) / 1000 * 100
    });
  });

  describe('formatGbp', () => {
    it('formats numbers as "£1,234.56"', () => {
      // The exact output might contain a non-breaking space or regular space depending on the Node version,
      // but it should contain the '£' and formatted number.
      const formatted = formatGbp(1234.56);
      expect(formatted).toMatch(/£1,234\.56/);
    });
  });
});