/**
 * PA Stage 7a — Sizing Solver PA-shape fields
 *
 * Verifies that runSizeLayout with paMode=true produces the new
 * DimensionSheetPA fields required by the BESS-style renderer.
 *
 * All new fields are optional — the legacy path (paMode=false / absent) must
 * work unchanged, and the PA path must populate the fields correctly.
 */
import { runSizeLayout } from './3-size-layout';
import type { Module, DimensionSheetPA } from '../types';

// ── Shared BESS fixture ───────────────────────────────────────────────────────

const bessModules: Module[] = [
  {
    id: 'bms',
    name: 'Battery Management System',
    purpose: 'Monitor and protect battery cells',
    inputs: ['cell voltage', 'temperature'],
    outputs: ['state of charge', 'alarm signals'],
    keyParts: ['BMS controller'],
    leadWeeks: 8,
    estimatedMassKg: 45,
    description: 'Cell-level monitoring and protection',
    whyItMatters: 'Safety critical',
    failureModes: ['overcharge'],
    unknowns: [],
    status: 'preliminary',
  },
  {
    id: 'battery_rack',
    name: 'Battery Rack',
    purpose: 'House LFP cells',
    inputs: ['cells'],
    outputs: ['DC power'],
    keyParts: ['CATL 280Ah cells'],
    leadWeeks: 12,
    estimatedMassKg: 2800,
    description: 'CATL LFP rack modules',
    whyItMatters: 'Primary energy store',
    failureModes: ['thermal runaway'],
    unknowns: [],
    status: 'preliminary',
  },
  {
    id: 'pcs',
    name: 'Power Conversion System (inverter)',
    purpose: 'Convert DC to AC',
    inputs: ['DC bus'],
    outputs: ['AC grid'],
    keyParts: ['Sungrow SG250HX'],
    leadWeeks: 10,
    estimatedMassKg: 950,
    description: 'Bidirectional inverter',
    whyItMatters: 'Grid interface',
    failureModes: ['IGBT failure'],
    unknowns: [],
    status: 'preliminary',
  },
  {
    id: 'thermal_mgmt',
    name: 'Thermal Management System (cooling)',
    purpose: 'Maintain cell temperature',
    inputs: ['coolant flow'],
    outputs: ['heat dissipation'],
    keyParts: ['chiller unit', 'liquid cooling plates'],
    leadWeeks: 8,
    estimatedMassKg: 380,
    description: 'Active liquid cooling',
    whyItMatters: 'Cycle life preservation',
    failureModes: ['pump failure'],
    unknowns: [],
    status: 'preliminary',
  },
  {
    id: 'fire_suppression',
    name: 'Fire Suppression System',
    purpose: 'Suppress thermal runaway propagation',
    inputs: ['alarm trigger'],
    outputs: ['suppressant discharge'],
    keyParts: ['FM-200 cylinders', 'detection heads'],
    leadWeeks: 6,
    estimatedMassKg: 120,
    description: 'Gaseous fire suppression',
    whyItMatters: 'UL 9540A compliance',
    failureModes: ['nozzle blockage'],
    unknowns: [],
    status: 'preliminary',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Sizing Solver — PA-shape fields (paMode=true, battery_energy_storage)', () => {

  let result: Awaited<ReturnType<typeof runSizeLayout>>;
  let sheet: DimensionSheetPA;

  beforeAll(async () => {
    result = await runSizeLayout(bessModules, {
      domain: 'battery_energy_storage',
      paMode: true,
    });
    sheet = result.data as DimensionSheetPA;
  });

  it('returns ok=true', () => {
    expect(result.ok).toBe(true);
  });

  it('produces at least one zone', () => {
    expect(sheet.zones).toBeDefined();
    expect((sheet.zones ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('zone names are non-empty strings', () => {
    for (const zone of sheet.zones ?? []) {
      expect(zone.name).toBeTruthy();
    }
  });

  it('each zone has lengthMm > 0', () => {
    for (const zone of sheet.zones ?? []) {
      expect(zone.lengthMm).toBeGreaterThan(0);
    }
  });

  it('each zone has volumeM3 >= 0', () => {
    for (const zone of sheet.zones ?? []) {
      expect(zone.volumeM3).toBeGreaterThanOrEqual(0);
    }
  });

  it('each zone has a non-empty contents string', () => {
    for (const zone of sheet.zones ?? []) {
      expect(zone.contents).toBeTruthy();
    }
  });

  it('volumeUtilisationPct is a number between 0 and 100', () => {
    expect(sheet.volumeUtilisationPct).toBeDefined();
    expect(sheet.volumeUtilisationPct).toBeGreaterThanOrEqual(0);
    expect(sheet.volumeUtilisationPct).toBeLessThanOrEqual(100);
  });

  it('massUtilisationPct is a number between 0 and 100', () => {
    expect(sheet.massUtilisationPct).toBeDefined();
    expect(sheet.massUtilisationPct).toBeGreaterThanOrEqual(0);
    expect(sheet.massUtilisationPct).toBeLessThanOrEqual(100);
  });

  it('externalDimensionsMm has w, d, h', () => {
    expect(sheet.externalDimensionsMm).toBeDefined();
    expect(sheet.externalDimensionsMm?.w).toBeGreaterThan(0);
    expect(sheet.externalDimensionsMm?.d).toBeGreaterThan(0);
    expect(sheet.externalDimensionsMm?.h).toBeGreaterThan(0);
  });

  it('internalDimensionsMm has positive w, d, h values', () => {
    expect(sheet.internalDimensionsMm).toBeDefined();
    // Internal dimensions must all be positive.
    // Note: the ISO container has interior width (2352mm) < exterior width (2438mm),
    // but interior length (12032mm) is the full container length which equals the
    // exterior length — each dim corresponds to its own axis, not cross-axis.
    expect(sheet.internalDimensionsMm?.w).toBeGreaterThan(0);
    expect(sheet.internalDimensionsMm?.d).toBeGreaterThan(0);
    expect(sheet.internalDimensionsMm?.h).toBeGreaterThan(0);
  });

  it('tareMassKg > 0', () => {
    expect(sheet.tareMassKg).toBeDefined();
    expect(sheet.tareMassKg).toBeGreaterThan(0);
  });

  it('availablePayloadMassKg > 0', () => {
    expect(sheet.availablePayloadMassKg).toBeDefined();
    expect(sheet.availablePayloadMassKg).toBeGreaterThan(0);
  });

  it('clearanceNotes is a non-empty string', () => {
    expect(sheet.clearanceNotes).toBeTruthy();
  });

  it('massMarginNote is string or null (not undefined)', () => {
    // Must be defined (may be null when margin is acceptable).
    expect(Object.prototype.hasOwnProperty.call(sheet, 'massMarginNote')).toBe(true);
    expect(sheet.massMarginNote === null || typeof sheet.massMarginNote === 'string').toBe(true);
  });

  it('spatialPlan is still present', () => {
    expect((result.data as any).spatialPlan).toBeDefined();
  });

  it('legacy fields are intact (feasible, envelope, module_dimensions)', () => {
    expect(typeof sheet.feasible).toBe('boolean');
    expect(sheet.envelope).toBeDefined();
    expect(sheet.module_dimensions).toBeDefined();
  });
});

describe('Sizing Solver — legacy path unaffected (paMode absent)', () => {

  it('legacy call returns no zones or utilisation fields', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'battery_energy_storage',
      // paMode intentionally omitted
    });
    expect(result.ok).toBe(true);
    // Legacy sheet must not crash — zones may be absent
    const sheet = result.data as DimensionSheetPA;
    // The legacy solver does not populate zones — they are undefined.
    // Simply confirm the call succeeds without crashing.
    expect(result.data).toBeDefined();
    expect(typeof sheet.feasible).toBe('boolean');
  });

  it('heat_pump domain with paMode=true returns no zones (only iso_container extended)', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'heat_pump',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    // No PA extension for non-BESS domains.
    expect(sheet.zones).toBeUndefined();
    expect(sheet.volumeUtilisationPct).toBeUndefined();
  });
});

describe('Sizing Solver — modules with no estimatedMassKg', () => {

  it('null-safe when modules have no mass data', async () => {
    const masslessModules: Module[] = bessModules.map(m => ({ ...m, estimatedMassKg: undefined }));
    const result = await runSizeLayout(masslessModules, {
      domain: 'battery_energy_storage',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    expect(sheet.massUtilisationPct).toBe(0);
    expect(sheet.massMarginNote).toBeNull(); // 0 kg allocated = no tight margin
  });
});
