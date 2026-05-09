import {
  VENDOR_CATALOG,
  getVendorEntriesForClass,
  getVendorNamesForClass,
  findEntriesByPartTerm,
  getCatalogStats,
  type VendorCatalogEntry,
} from './vendor-catalog'
import { getVendorContext, listSupportedClasses } from './prompts-vendor-injection'

// ─── Catalog structure integrity ──────────────────────────────────────────────

describe('VENDOR_CATALOG structure', () => {
  it('has at least 30 entries (Pattern C minimum)', () => {
    expect(VENDOR_CATALOG.length).toBeGreaterThanOrEqual(30)
  })

  it('every entry has a non-empty partType, partLabel, and productClass array', () => {
    for (const entry of VENDOR_CATALOG) {
      expect(typeof entry.partType).toBe('string')
      expect(entry.partType.length).toBeGreaterThan(0)
      expect(typeof entry.partLabel).toBe('string')
      expect(entry.partLabel.length).toBeGreaterThan(0)
      expect(Array.isArray(entry.productClass)).toBe(true)
      expect(entry.productClass.length).toBeGreaterThan(0)
    }
  })

  it('every entry has 2 or 3 vendors (quality guard)', () => {
    for (const entry of VENDOR_CATALOG) {
      const count = entry.vendors.length
      // Gap entries (gapNote set) are allowed to have 2 vendors
      // Non-gap entries must have 2-3
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBeLessThanOrEqual(3)
    }
  })

  it('every vendor has a non-empty name and valid region', () => {
    const validRegions = new Set(['uk', 'eu', 'us', 'asia', 'global'])
    for (const entry of VENDOR_CATALOG) {
      for (const vendor of entry.vendors) {
        expect(typeof vendor.name).toBe('string')
        expect(vendor.name.length).toBeGreaterThan(0)
        expect(validRegions.has(vendor.region)).toBe(true)
      }
    }
  })

  it('every vendor has positive integer typicalLeadWeeks and typicalMoqUnits', () => {
    for (const entry of VENDOR_CATALOG) {
      for (const vendor of entry.vendors) {
        expect(Number.isInteger(vendor.typicalLeadWeeks)).toBe(true)
        expect(vendor.typicalLeadWeeks).toBeGreaterThan(0)
        expect(Number.isInteger(vendor.typicalMoqUnits)).toBe(true)
        expect(vendor.typicalMoqUnits).toBeGreaterThan(0)
      }
    }
  })

  it('partType values are unique across the catalog (no duplicate entries)', () => {
    // partType should be unique within each productClass — duplicate entries
    // suggest copy-paste errors.
    const seen = new Map<string, string[]>()
    for (const entry of VENDOR_CATALOG) {
      for (const cls of entry.productClass) {
        const key = `${cls}::${entry.partType}`
        if (!seen.has(key)) seen.set(key, [])
        seen.get(key)!.push(entry.partLabel)
      }
    }
    for (const [key, labels] of seen.entries()) {
      expect(labels.length).toBe(1)
    }
  })
})

// ─── Coverage: 10 product classes ─────────────────────────────────────────────

describe('getCatalogStats coverage', () => {
  const stats = getCatalogStats()

  it('covers all 10 required product classes', () => {
    const required = [
      'energy_storage',
      'drone',
      'wearable_medical',
      'thermal_system',
      'ev_charger',
      'bioreactor',
      'vertical_farm',
      'auv',
      'edge_ai_server',
      'haps',
    ]
    for (const cls of required) {
      expect(stats.entriesByClass[cls]).toBeDefined()
      expect(stats.entriesByClass[cls]).toBeGreaterThanOrEqual(1)
    }
  })

  it('each product class has at least 4 entries', () => {
    for (const [cls, count] of Object.entries(stats.entriesByClass)) {
      // HAPS is the thinnest class by design (see gap notes) — minimum 4 entries
      expect(count).toBeGreaterThanOrEqual(4)
    }
  })

  it('total unique vendor count exceeds 50', () => {
    expect(stats.totalUniqueVendors).toBeGreaterThan(50)
  })
})

// ─── Lookup helpers ───────────────────────────────────────────────────────────

describe('getVendorEntriesForClass', () => {
  it('returns energy_storage entries and they include LFP cell entry', () => {
    const entries = getVendorEntriesForClass('energy_storage')
    expect(entries.length).toBeGreaterThanOrEqual(5)
    const lfpEntry = entries.find(e => e.partType === 'lfp_prismatic_cell')
    expect(lfpEntry).toBeDefined()
    expect(lfpEntry!.vendors.map(v => v.name)).toContain('CATL')
  })

  it('returns empty array for unknown product class', () => {
    const entries = getVendorEntriesForClass('quantum_computer')
    expect(entries).toHaveLength(0)
  })

  it('returns drone entries with flight controller and motor', () => {
    const entries = getVendorEntriesForClass('drone')
    const partTypes = entries.map(e => e.partType)
    expect(partTypes).toContain('drone_flight_controller')
    expect(partTypes).toContain('drone_propulsion_motor')
  })
})

describe('getVendorNamesForClass', () => {
  it('returns a flat deduplicated list of vendor names for energy_storage', () => {
    const names = getVendorNamesForClass('energy_storage')
    expect(names).toContain('CATL')
    expect(names).toContain('Sungrow')
    expect(names).toContain('Nuvation Energy')
    // Should be unique — no duplicates
    expect(names.length).toBe(new Set(names).size)
  })

  it('returns empty array for unknown class', () => {
    expect(getVendorNamesForClass('underwater_welding')).toHaveLength(0)
  })
})

describe('findEntriesByPartTerm', () => {
  it('finds entries by partial partType match', () => {
    const entries = findEntriesByPartTerm('thruster')
    expect(entries.length).toBeGreaterThanOrEqual(1)
    expect(entries[0].productClass).toContain('auv')
  })

  it('finds entries by partial partLabel match (case-insensitive)', () => {
    const entries = findEntriesByPartTerm('LED')
    expect(entries.length).toBeGreaterThanOrEqual(1)
  })

  it('respects productClass filter', () => {
    const allEntries = findEntriesByPartTerm('battery')
    const auvOnly = findEntriesByPartTerm('battery', 'auv')
    expect(auvOnly.length).toBeLessThanOrEqual(allEntries.length)
    for (const e of auvOnly) {
      expect(e.productClass).toContain('auv')
    }
  })

  it('returns empty array for no match', () => {
    expect(findEntriesByPartTerm('quantum_entanglement_chip')).toHaveLength(0)
  })
})

// ─── Gap notes ────────────────────────────────────────────────────────────────

describe('gap notes', () => {
  it('HAPS energy storage entry has a gapNote about Li-S', () => {
    const entries = getVendorEntriesForClass('haps')
    const battEntry = entries.find(e => e.partType === 'haps_energy_storage')
    expect(battEntry).toBeDefined()
    expect(battEntry!.gapNote).toBeDefined()
    expect(battEntry!.gapNote!.toLowerCase()).toContain('li-s')
  })

  it('HAPS solar laminate entry has a gapNote', () => {
    const entries = getVendorEntriesForClass('haps')
    const solarEntry = entries.find(e => e.partType === 'haps_solar_laminate')
    expect(solarEntry).toBeDefined()
    expect(solarEntry!.gapNote).toBeDefined()
  })
})

// ─── Prompt injection ─────────────────────────────────────────────────────────

describe('getVendorContext', () => {
  it('returns non-empty string for energy_storage', () => {
    const ctx = getVendorContext('energy_storage')
    expect(ctx.length).toBeGreaterThan(100)
    expect(ctx).toContain('VENDOR CATALOG')
    expect(ctx).toContain('energy_storage')
  })

  it('includes real vendor names in output', () => {
    const ctx = getVendorContext('energy_storage')
    expect(ctx).toContain('CATL')
    expect(ctx).toContain('Sungrow')
    expect(ctx).toContain('Nuvation Energy')
  })

  it('includes lead time and MOQ in output', () => {
    const ctx = getVendorContext('drone')
    expect(ctx).toContain('wk lead')
    expect(ctx).toContain('MOQ')
  })

  it('includes gap note for HAPS', () => {
    const ctx = getVendorContext('haps')
    expect(ctx).toContain('GAP')
  })

  it('returns empty string for unknown product class (no regression risk)', () => {
    const ctx = getVendorContext('flux_capacitor')
    expect(ctx).toBe('')
  })

  it('instructs LLM to never invent company names', () => {
    const ctx = getVendorContext('bioreactor')
    expect(ctx.toLowerCase()).toContain('never invent')
  })

  it('provides distributor fallback instruction', () => {
    const ctx = getVendorContext('auv')
    expect(ctx).toContain('RS Components')
    expect(ctx).toContain('Farnell')
  })
})

// ─── listSupportedClasses ─────────────────────────────────────────────────────

describe('listSupportedClasses', () => {
  it('returns all 10 expected product classes', () => {
    const classes = listSupportedClasses()
    const expected = [
      'auv', 'bioreactor', 'drone', 'edge_ai_server', 'energy_storage',
      'ev_charger', 'haps', 'thermal_system', 'vertical_farm', 'wearable_medical',
    ]
    for (const cls of expected) {
      expect(classes).toContain(cls)
    }
  })

  it('returns a sorted list', () => {
    const classes = listSupportedClasses()
    const sorted = [...classes].sort()
    expect(classes).toEqual(sorted)
  })
})
