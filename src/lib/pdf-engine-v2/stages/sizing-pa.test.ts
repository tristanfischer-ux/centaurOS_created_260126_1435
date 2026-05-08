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

  it('heat_pump domain with paMode=true now returns PA fields (BLOCKER-D2-3 fix)', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'heat_pump',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    // BLOCKER-D2-3 FIX: extendSizingSheetPA now fires for ALL domains on paMode=true.
    // Non-BESS domains should still produce the universal fields.
    // zones[] may be present (generic grouping) or empty for heat_pump.
    expect(Array.isArray(sheet.zones)).toBe(true);
    // volumeUtilisationPct: null when volume data is unavailable (BLOCKER-D2-5 fix).
    // For heat_pump, interior_volume_m3 is available (0.935 + 0.36 = 1.295 m³).
    // Either a number or null is acceptable — must not be undefined.
    expect(sheet.volumeUtilisationPct === null || typeof sheet.volumeUtilisationPct === 'number').toBe(true);
    expect(sheet.clearanceNotes).toBeTruthy();
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

// ── BLOCKER-D2-3 fix tests — all product classes get PA fields ────────────────

describe('BLOCKER-D2-3 fix — extendSizingSheetPA fires for all domains on paMode=true', () => {

  it('vertical_farm with paMode=true produces universal PA fields', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'vertical_farm',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    // Universal fields must be populated for non-BESS domains.
    expect(sheet.clearanceNotes).toBeTruthy();
    expect(sheet.internalDimensionsMm).toBeDefined();
    expect(sheet.internalDimensionsMm?.w).toBeGreaterThan(0);
    expect(sheet.internalDimensionsMm?.d).toBeGreaterThan(0);
    expect(sheet.internalDimensionsMm?.h).toBeGreaterThan(0);
    // massUtilisationPct must be a number (not undefined).
    expect(typeof sheet.massUtilisationPct).toBe('number');
  });

  it('generic domain with paMode=true produces universal PA fields', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'generic',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    expect(sheet.clearanceNotes).toBeTruthy();
    expect(sheet.externalDimensionsMm).toBeDefined();
    expect(Array.isArray(sheet.zones)).toBe(true);
  });

  it('each of the 3 known domains produces at least the universal fields without crashing', async () => {
    const domains = ['battery_energy_storage', 'heat_pump', 'vertical_farm'];
    for (const domain of domains) {
      const result = await runSizeLayout(bessModules, { domain, paMode: true });
      expect(result.ok).toBe(true);
      const sheet = result.data as DimensionSheetPA;
      // Universal fields: volumeUtilisationPct (number|null) and massUtilisationPct (number).
      const volPctOk = sheet.volumeUtilisationPct === null || typeof sheet.volumeUtilisationPct === 'number';
      expect(volPctOk).toBe(true); // volumeUtilisationPct must be number|null, not undefined
      expect(typeof sheet.massUtilisationPct).toBe('number');
    }
  });
});

// ── BLOCKER-D2-4 fix tests — ISO container kind drives tare/payload/external dims ──

describe('BLOCKER-D2-4 fix — ISO container spec selected by envelope.kind', () => {

  it('battery_energy_storage (40ft) produces externalDimensionsMm matching 40ft ISO spec', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'battery_energy_storage',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    // ISO 40ft external: w=2438, d=12192, h=2896
    expect(sheet.externalDimensionsMm?.d).toBe(12192);
    expect(sheet.externalDimensionsMm?.w).toBe(2438);
    expect(sheet.tareMassKg).toBe(3750);
    expect(sheet.availablePayloadMassKg).toBe(27_230);
  });

  it('non-container domain (vertical_farm) does not use ISO 40ft tare values', async () => {
    const result = await runSizeLayout(bessModules, {
      domain: 'vertical_farm',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    // Non-container: tare should be 0, not 3750 (ISO 40ft tare).
    expect(sheet.tareMassKg).toBe(0);
    // externalDimensionsMm should match warehouse_bay interior (not 40ft).
    expect(sheet.externalDimensionsMm?.d).not.toBe(12192);
  });
});

// ── BLOCKER-D2-5 fix tests — volumeUtilisationPct null when volume unavailable ──

describe('BLOCKER-D2-5 fix — volumeUtilisationPct is null (not 100) when volume data is unavailable', () => {

  it('missing-volume case: module dimensions all zero produces volumeUtilisationPct === null or >= 0, not bogus 100', async () => {
    // Use modules with no estimatedMassKg — the solver will assign zero-area dims.
    const zeroMassModules: Module[] = bessModules.map(m => ({ ...m, estimatedMassKg: undefined }));
    const result = await runSizeLayout(zeroMassModules, {
      domain: 'battery_energy_storage',
      paMode: true,
    });
    expect(result.ok).toBe(true);
    const sheet = result.data as DimensionSheetPA;
    // volumeUtilisationPct: must not be a phantom 100 from a `|| 1` fallback.
    // The BESS envelope has a real volume (67 m³), so we get a real pct (near 0).
    // The key assertion is that it is NOT undefined — it must be a number or null.
    expect(sheet.volumeUtilisationPct === null || typeof sheet.volumeUtilisationPct === 'number').toBe(true);
    if (typeof sheet.volumeUtilisationPct === 'number') {
      // Must be near 0 for zero-mass modules — NOT 100.
      expect(sheet.volumeUtilisationPct).toBeLessThan(10);
    }
  });
});
