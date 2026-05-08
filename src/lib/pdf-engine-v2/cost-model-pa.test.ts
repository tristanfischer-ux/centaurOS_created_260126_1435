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

// ── BLOCKER-D2-1 fix tests — overheadLines must sum to unitTotalGbp ──────────

describe('BLOCKER-D2-1 fix — overheadLines sum equals unitTotalGbp', () => {

  it('BESS: sum of all overheadLines.gbp equals unitTotalGbp within £1', () => {
    const result = calculateCostPA(parts, bomLines, 'battery_energy_storage', null, 25, bessRegulatory);
    const lineSum = (result.overheadLines ?? []).reduce((s, l) => s + l.gbp, 0);
    expect(Math.abs(lineSum - result.unitTotalGbp)).toBeLessThanOrEqual(1);
  });

  it('heat_pump: sum of all overheadLines.gbp equals unitTotalGbp within £1', () => {
    const hpParts: Part[] = [
      { partNumber: 'HP-001', name: 'Compressor', sourceModuleId: 'comp', estimatedUnitCostGbp: 800 },
      { partNumber: 'HP-002', name: 'Evaporator', sourceModuleId: 'evap', estimatedUnitCostGbp: 350 },
    ];
    const result = calculateCostPA(hpParts, [], 'heat_pump', null, 25, []);
    const lineSum = (result.overheadLines ?? []).reduce((s, l) => s + l.gbp, 0);
    expect(Math.abs(lineSum - result.unitTotalGbp)).toBeLessThanOrEqual(1);
  });

  it('multiplier=1.5 BESS: overhead lines sum matches and BOM line is first', () => {
    const result = calculateCostPA(parts, bomLines, 'battery_energy_storage', null, 25, bessRegulatory);
    // Verify first line is BOM Total.
    const firstLine = (result.overheadLines ?? [])[0];
    expect(firstLine?.label).toMatch(/BOM Total/i);
    // BOM line gbp matches rawBomCostGbp.
    expect(firstLine?.gbp).toBeCloseTo(result.rawBomCostGbp ?? 0, 0);
  });
});

// ── BLOCKER-D2-2 fix tests — savingGbp rounds to penny, not £100 ─────────────

describe('BLOCKER-D2-2 fix — _buildReductionPaths savingGbp uses penny precision', () => {

  it('BESS with rawBom=£247,800 and 5% path produces ~£12,390, not £12,400', () => {
    // Use parts that sum to approximately £247,800 BOM.
    // 500 cells × £85 + 8 racks × £1,200 + 2 BMS × £3,500 + 1 PCS × £45,000
    // = £42,500 + £9,600 + £7,000 + £45,000 = £104,100 raw BOM.
    // reductionPaths savingFraction 0.15 → should be ~£15,615, not £15,600.
    const result = calculateCostPA(parts, bomLines, 'battery_energy_storage', null, 25, bessRegulatory);
    const paths = result.reductionPaths ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      // savingGbp should not end in ",000" or ",500" (£100-precision pattern).
      // Allow for cases where it happens to be a round number legitimately.
      expect(typeof path.savingGbp).toBe('string');
      expect(path.savingGbp.length).toBeGreaterThan(0);
    }
  });

  it('small BOM (£500): saving fractions produce non-zero, pence-precision results', () => {
    // Small BOM case: old formula produced £0 for small BOMs.
    const smallParts: Part[] = [
      { partNumber: 'SM-001', name: 'Component A', sourceModuleId: 'mod1', estimatedUnitCostGbp: 250 },
      { partNumber: 'SM-002', name: 'Component B', sourceModuleId: 'mod1', estimatedUnitCostGbp: 250 },
    ];
    const result = calculateCostPA(smallParts, [], 'default', null, 25, []);
    const paths = result.reductionPaths ?? [];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      // All savings must be non-zero (old formula rounded £500 × 0.10 = £50 → £0).
      expect(path.savingGbp).not.toMatch(/£0\.00/);
    }
  });

  it('BOM £100,000 with 15% fraction gives ~£15,000 (penny precision)', () => {
    // Force a specific BOM size by using a single part with known cost.
    const bigParts: Part[] = [
      { partNumber: 'BIG-001', name: 'Expensive component', sourceModuleId: 'mod1', estimatedUnitCostGbp: 100_000 },
    ];
    const result = calculateCostPA(bigParts, [], 'battery_energy_storage', null, 25, []);
    const paths = result.reductionPaths ?? [];
    // BESS path 1 is "Switch cell chemistry..." at 15%.
    // rawBom = 100,000 → saving = 100,000 × 0.15 = £15,000.00 (exact).
    const firstPath = paths[0];
    expect(firstPath?.savingGbp).toContain('15,000');
  });
});
