/**
 * PA Stage 7b — Cost Computation PA-shape fields
 *
 * Verifies that calculateCostPA() returns the new CostBreakdownPA fields
 * required by the BESS-style renderer.
 *
 * Also verifies:
 *   - overheadLines.length >= 3
 *   - nreItems.length >= 2 for a regulated product class (BESS with 3 standards)
 *   - ceilingExceededBanner populated when cost > ceiling, absent when within
 *   - existing calculateCost() path unaffected (legacy null-safe check)
 */
import { calculateCostPA, calculateCost } from './cost-model';
import type { Part, BomLine, RegulatoryItem } from './types';

// ── Shared fixture ────────────────────────────────────────────────────────────

const parts: Part[] = [
  { partNumber: 'BATT-001', name: 'CATL 280Ah LFP Cell', sourceModuleId: 'battery_rack', estimatedUnitCostGbp: 85, massKg: 5.5 },
  { partNumber: 'BATT-002', name: 'Battery rack enclosure', sourceModuleId: 'battery_rack', estimatedUnitCostGbp: 1200, massKg: 80 },
  { partNumber: 'BMS-001', name: 'BMS controller board', sourceModuleId: 'bms', estimatedUnitCostGbp: 3500, massKg: 2 },
  { partNumber: 'PCS-001', name: 'Sungrow SG250HX inverter', sourceModuleId: 'pcs', estimatedUnitCostGbp: 45000, massKg: 750 },
];

const bomLines: BomLine[] = [
  { childPartId: 'BATT-001', quantity: 500 },   // 500 cells
  { childPartId: 'BATT-002', quantity: 8 },      // 8 rack enclosures
  { childPartId: 'BMS-001', quantity: 2 },
  { childPartId: 'PCS-001', quantity: 1 },
];

const bessRegulatory: RegulatoryItem[] = [
  { code: 'UL 9540A', name: 'UL 9540A', summary: 'System-level fire and thermal-runaway test', status: 'not_started' },
  { code: 'G99', name: 'G99', summary: 'UK DNO grid-connection compliance', status: 'not_started' },
  { code: 'IEC 62619', name: 'IEC 62619', summary: 'Secondary lithium cells safety', status: 'not_started' },
];

// Cost exceeds £180k ceiling (rawBom + overhead multiplier on BESS should be well above).
const CEILING_GBP = 180_000;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('calculateCostPA — overheadLines', () => {

  let result: ReturnType<typeof calculateCostPA>;

  beforeAll(() => {
    result = calculateCostPA(parts, bomLines, 'battery_energy_storage', CEILING_GBP, 25, bessRegulatory);
  });

  it('returns overheadLines array', () => {
    expect(result.overheadLines).toBeDefined();
    expect(Array.isArray(result.overheadLines)).toBe(true);
  });

  it('overheadLines has at least 3 items (BOM, assembly, overhead minimum)', () => {
    expect((result.overheadLines ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('all overhead lines have a non-empty label', () => {
    for (const line of result.overheadLines ?? []) {
      expect(line.label).toBeTruthy();
    }
  });

  it('all overhead lines have a non-negative gbp amount', () => {
    for (const line of result.overheadLines ?? []) {
      expect(line.gbp).toBeGreaterThanOrEqual(0);
    }
  });

  it('first overhead line is BOM Total', () => {
    expect((result.overheadLines ?? [])[0]?.label).toMatch(/BOM Total/i);
  });
});

describe('calculateCostPA — perModulePA', () => {

  let result: ReturnType<typeof calculateCostPA>;

  beforeAll(() => {
    result = calculateCostPA(parts, bomLines, 'battery_energy_storage', CEILING_GBP, 25, bessRegulatory);
  });

  it('perModulePA is defined and matches module count', () => {
    expect(result.perModulePA).toBeDefined();
    expect((result.perModulePA ?? []).length).toBe(result.perModule.length);
  });

  it('pctOfBom values sum to approximately 100', () => {
    const total = (result.perModulePA ?? []).reduce((s, m) => s + m.pctOfBom, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it('each perModulePA row has a grade field', () => {
    for (const row of result.perModulePA ?? []) {
      expect(row.grade).toBeTruthy();
    }
  });
});

describe('calculateCostPA — nreItems for BESS with 3 regulated standards', () => {

  let result: ReturnType<typeof calculateCostPA>;

  beforeAll(() => {
    result = calculateCostPA(parts, bomLines, 'battery_energy_storage', CEILING_GBP, 25, bessRegulatory);
  });

  it('nreItems is defined', () => {
    expect(result.nreItems).toBeDefined();
  });

  it('nreItems.length >= 2 for a product with 3 regulatory entries', () => {
    expect((result.nreItems ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('each nreItem has a non-empty label', () => {
    for (const item of result.nreItems ?? []) {
      expect(item.label).toBeTruthy();
    }
  });

  it('each nreItem has gbp > 0', () => {
    for (const item of result.nreItems ?? []) {
      expect(item.gbp).toBeGreaterThan(0);
    }
  });

  it('each nreItem has durationWeeks > 0', () => {
    for (const item of result.nreItems ?? []) {
      expect(item.durationWeeks).toBeGreaterThan(0);
    }
  });

  it('all nreItems have grade C (published benchmark)', () => {
    for (const item of result.nreItems ?? []) {
      expect(item.grade).toBe('C');
    }
  });
});

describe('calculateCostPA — reductionPaths', () => {

  let result: ReturnType<typeof calculateCostPA>;

  beforeAll(() => {
    result = calculateCostPA(parts, bomLines, 'battery_energy_storage', CEILING_GBP, 25, bessRegulatory);
  });

  it('reductionPaths is defined', () => {
    expect(result.reductionPaths).toBeDefined();
  });

  it('at least one reduction path is returned', () => {
    expect((result.reductionPaths ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('each path has a non-empty option description', () => {
    for (const path of result.reductionPaths ?? []) {
      expect(path.option).toBeTruthy();
    }
  });

  it('each path has a non-empty savingGbp string', () => {
    for (const path of result.reductionPaths ?? []) {
      expect(path.savingGbp).toBeTruthy();
    }
  });

  it('feasible field has valid values', () => {
    const valid = new Set(['Yes', 'No', 'Maybe', 'At volume']);
    for (const path of result.reductionPaths ?? []) {
      expect(valid.has(path.feasible)).toBe(true);
    }
  });
});

describe('calculateCostPA — ceilingExceededBanner', () => {

  it('banner is populated when unit cost exceeds ceiling', () => {
    // Force a very low ceiling so cost will certainly exceed it.
    const result = calculateCostPA(parts, bomLines, 'battery_energy_storage', 1, 25, bessRegulatory);
    expect(result.ceilingExceededBanner).toBeTruthy();
    expect(typeof result.ceilingExceededBanner).toBe('string');
  });

  it('banner contains the ceiling and overshoot amounts', () => {
    const result = calculateCostPA(parts, bomLines, 'battery_energy_storage', 1, 25, bessRegulatory);
    expect(result.ceilingExceededBanner).toMatch(/Target ceiling/i);
    expect(result.ceilingExceededBanner).toMatch(/Overshoot/i);
  });

  it('banner is null when cost is within ceiling', () => {
    // Use a single cheap part with a very high ceiling.
    const cheapParts: Part[] = [
      { partNumber: 'CHK-001', name: 'Cheap part', sourceModuleId: 'mod1', estimatedUnitCostGbp: 10 },
    ];
    const result = calculateCostPA(cheapParts, [], 'default', 1_000_000, 25, []);
    expect(result.ceilingExceededBanner).toBeNull();
  });

  it('banner is null when ceiling is null', () => {
    const result = calculateCostPA(parts, bomLines, 'battery_energy_storage', null, 25, bessRegulatory);
    expect(result.ceilingExceededBanner).toBeNull();
  });
});

describe('calculateCostPA — legacy fields still present', () => {

  let result: ReturnType<typeof calculateCostPA>;

  beforeAll(() => {
    result = calculateCostPA(parts, bomLines, 'battery_energy_storage', CEILING_GBP, 25, bessRegulatory);
  });

  it('unitTotalGbp > 0', () => {
    expect(result.unitTotalGbp).toBeGreaterThan(0);
  });

  it('perModule array is populated', () => {
    expect(result.perModule.length).toBeGreaterThan(0);
  });

  it('overheadMultiplier is 1.5 for battery_energy_storage', () => {
    expect(result.overheadMultiplier).toBe(1.5);
  });

  it('nreTotalGbp comes from legacy base calculation', () => {
    expect(result.nreTotalGbp).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateCost legacy — null-safe (no new fields present)', () => {

  it('legacy calculateCost still works and returns no PA fields', () => {
    const result = calculateCost(parts, bomLines, 'battery_energy_storage', CEILING_GBP, 25);
    // Legacy result must not crash — no PA fields expected.
    expect(result.unitTotalGbp).toBeGreaterThan(0);
    expect((result as any).overheadLines).toBeUndefined();
    expect((result as any).nreItems).toBeUndefined();
    expect((result as any).ceilingExceededBanner).toBeUndefined();
  });
});

describe('calculateCostPA — empty parts / no regulatory', () => {

  it('gracefully handles empty parts with no regulatory', () => {
    const result = calculateCostPA([], [], 'default', null, 25, []);
    expect(result.unitTotalGbp).toBe(0);
    expect(result.overheadLines).toBeDefined();
    expect(result.nreItems).toBeDefined();
    expect(result.ceilingExceededBanner).toBeNull();
  });
});
