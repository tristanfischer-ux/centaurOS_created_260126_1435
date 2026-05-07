import { findProvidersByService, findProvidersByCertification, getProviderSummary, _SERVICE_PROVIDERS } from './service-providers'

describe('service-providers', () => {
  it('finds providers by service type', () => {
    const ulProviders = findProvidersByService('ul_testing')
    expect(ulProviders.length).toBeGreaterThan(0)
    expect(ulProviders.every(p => p.serviceType === 'ul_testing')).toBe(true)
  })

  it('finds providers by certification', () => {
    const un383Providers = findProvidersByCertification('UN 38.3')
    expect(un383Providers.length).toBeGreaterThan(0)
    
    // Intertek doesn't have UN 38.3, TUV SUD does
    const names = un383Providers.map(p => p.name)
    expect(names).toContain('TÜV SÜD UK')
    expect(names).not.toContain('Intertek')
  })

  it('gets summary for ul_testing', () => {
    const summary = getProviderSummary('ul_testing')
    expect(summary.count).toBeGreaterThan(0)
    expect(summary.minCost).toBeGreaterThan(0)
    expect(summary.maxCost).toBeGreaterThan(summary.minCost)
    expect(summary.minWeeks).toBeGreaterThan(0)
    expect(summary.maxWeeks).toBeGreaterThan(summary.minWeeks)
  })

  it('gets summary for empty service type', () => {
    const summary = getProviderSummary('non_existent_service')
    expect(summary).toEqual({ count: 0, minCost: 0, maxCost: 0, minWeeks: 0, maxWeeks: 0 })
  })

  it('ensures all providers have required fields', () => {
    for (const provider of _SERVICE_PROVIDERS) {
      expect(provider.name).toBeDefined()
      expect(provider.serviceType).toBeDefined()
      expect(provider.location).toBeDefined()
      expect(provider.website).toBeDefined()
      expect(provider.typicalCostRangeGbp.min).toBeDefined()
      expect(provider.typicalCostRangeGbp.max).toBeDefined()
      expect(provider.typicalDurationWeeks.min).toBeDefined()
      expect(provider.typicalDurationWeeks.max).toBeDefined()
      expect(Array.isArray(provider.certifications)).toBe(true)
      expect(provider.certifications.length).toBeGreaterThan(0)
    }
  })
})