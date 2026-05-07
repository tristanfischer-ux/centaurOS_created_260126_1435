import {
  classifyDomain,
  productClassToDomainTags,
  tagIntersectionBoost,
  ALL_DOMAIN_TAGS,
} from './domain-tags'

describe('domain-tags', () => {
  describe('classifyDomain', () => {
    it('returns empty for null/empty input', () => {
      expect(classifyDomain(null)).toEqual([])
      expect(classifyDomain('')).toEqual([])
      expect(classifyDomain(undefined)).toEqual([])
    })

    it('tags a BESS supplier page correctly', () => {
      const text = 'We supply LFP prismatic cells and BMS modules for battery energy storage systems. Our CATL-compatible racks are designed for grid-scale BESS installations.'
      const tags = classifyDomain(text)
      expect(tags).toContain('battery_energy_storage')
    })

    it('tags a heat pump supplier page correctly', () => {
      const text = 'Air-to-water heat pump units with R290 refrigerant. Monobloc designs for commercial HVAC retrofit. Featuring scroll compressor and electronic expansion valve.'
      const tags = classifyDomain(text)
      expect(tags).toContain('heat_pump_hvac')
    })

    it('tags a vertical farm supplier page correctly', () => {
      const text = 'LED grow lights for vertical farm and hydroponic growers. PAR sensors and fertigation systems for leafy greens production.'
      const tags = classifyDomain(text)
      expect(tags).toContain('vertical_farm_horticulture')
    })

    it('tags multiple domains when a company is cross-domain', () => {
      const text = 'CNC machining, turning and milling alongside sheet metal laser cutting and press brake forming for enclosures, chassis and battery module casings. AS9100 and IATF 16949 certified.'
      const tags = classifyDomain(text)
      expect(tags).toContain('cnc_machining')
      expect(tags).toContain('sheet_metal')
      expect(tags).toContain('enclosures_chassis')
    })

    it('does NOT tag on a single passing mention', () => {
      // One mention of "battery" in an aerospace company shouldn't tag BESS.
      const text = 'Aerospace precision machining specialist. Historically one project involved a battery.'
      const tags = classifyDomain(text)
      expect(tags).not.toContain('battery_energy_storage')
      // But aerospace should match
      expect(tags).toContain('aerospace')
    })

    it('ranks tags by hit count', () => {
      const text = 'battery lithium LFP prismatic cell BMS. One CNC reference.'
      const tags = classifyDomain(text)
      // battery_energy_storage should rank before cnc_machining
      const bIdx = tags.indexOf('battery_energy_storage')
      const cIdx = tags.indexOf('cnc_machining')
      if (cIdx !== -1) {
        expect(bIdx).toBeLessThan(cIdx)
      } else {
        expect(bIdx).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('productClassToDomainTags', () => {
    it('maps energy_storage to battery + power + thermal', () => {
      const tags = productClassToDomainTags('energy_storage')
      expect(tags).toContain('battery_energy_storage')
      expect(tags).toContain('power_electronics')
      expect(tags).toContain('thermal_management')
    })

    it('maps battery_energy_storage (classifier alt name)', () => {
      const tags = productClassToDomainTags('battery_energy_storage')
      expect(tags).toContain('battery_energy_storage')
    })

    it('maps thermal_system to heat pump tags', () => {
      const tags = productClassToDomainTags('thermal_system')
      expect(tags).toContain('heat_pump_hvac')
      expect(tags).toContain('thermal_management')
    })

    it('maps vertical_farm to horticulture tags', () => {
      const tags = productClassToDomainTags('vertical_farm')
      expect(tags).toContain('vertical_farm_horticulture')
      expect(tags).toContain('sensors_instrumentation')
    })

    it('always includes generalist tags', () => {
      const tags = productClassToDomainTags('anything')
      expect(tags).toContain('general_engineering')
      expect(tags).toContain('cnc_machining')
      expect(tags).toContain('sheet_metal')
      expect(tags).toContain('electronics_pcb')
    })

    it('de-duplicates tags', () => {
      const tags = productClassToDomainTags('energy_storage')
      const set = new Set(tags)
      expect(set.size).toBe(tags.length)
    })
  })

  describe('tagIntersectionBoost', () => {
    it('returns 1.0 for empty inputs', () => {
      expect(tagIntersectionBoost([], ['battery_energy_storage'])).toBe(1.0)
      expect(tagIntersectionBoost(['battery_energy_storage'], [])).toBe(1.0)
    })

    it('returns 0.85 (gentle demotion) for no overlap', () => {
      expect(tagIntersectionBoost(['aerospace'], ['vertical_farm_horticulture'])).toBe(0.85)
    })

    it('boosts by 0.10 per overlapping tag (up to 3)', () => {
      expect(tagIntersectionBoost(
        ['battery_energy_storage'],
        ['battery_energy_storage'],
      )).toBeCloseTo(1.10, 2)

      expect(tagIntersectionBoost(
        ['battery_energy_storage', 'power_electronics'],
        ['battery_energy_storage', 'power_electronics'],
      )).toBeCloseTo(1.20, 2)

      expect(tagIntersectionBoost(
        ['battery_energy_storage', 'power_electronics', 'thermal_management', 'cnc_machining'],
        ['battery_energy_storage', 'power_electronics', 'thermal_management'],
      )).toBeCloseTo(1.30, 2)
    })
  })

  describe('ALL_DOMAIN_TAGS', () => {
    it('has exactly 20 tags', () => {
      expect(ALL_DOMAIN_TAGS).toHaveLength(20)
    })

    it('all tag names are valid', () => {
      for (const tag of ALL_DOMAIN_TAGS) {
        expect(tag).toMatch(/^[a-z_]+$/)
      }
    })
  })
})
