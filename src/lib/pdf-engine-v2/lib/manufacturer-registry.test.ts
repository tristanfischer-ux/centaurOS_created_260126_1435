import { findManufacturer, getResellers, MANUFACTURERS } from './manufacturer-registry'

describe('manufacturer-registry', () => {
  it('finds by exact name', () => {
    const result = findManufacturer('Sungrow')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Sungrow')
  })

  it('finds by alias', () => {
    const result = findManufacturer('lg chem')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('LG Energy Solution')
  })

  it('returns null for no match', () => {
    const result = findManufacturer('Unknown Brand 123')
    expect(result).toBeNull()
  })

  it('getResellers returns correct format', () => {
    const resellers = getResellers('ti')
    expect(resellers.length).toBeGreaterThan(0)
    expect(resellers[0]).toHaveProperty('manufacturer', 'Texas Instruments')
    expect(resellers[0]).toHaveProperty('reseller')
    expect(resellers[0]).toHaveProperty('website')
  })

  it('all entries have required fields', () => {
    for (const entry of MANUFACTURERS) {
      expect(entry.name).toBeDefined()
      expect(Array.isArray(entry.aliases)).toBe(true)
      expect(entry.productType).toBeDefined()
      expect(Array.isArray(entry.ukResellers)).toBe(true)
      for (const reseller of entry.ukResellers) {
        expect(reseller.name).toBeDefined()
        expect(reseller.website).toBeDefined()
      }
    }
  })
})
