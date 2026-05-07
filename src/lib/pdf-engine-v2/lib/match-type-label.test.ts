import { classifyMatchType } from './match-type-label'

describe('classifyMatchType', () => {
  it('returns Distributor SKU for buy_electronic + distributor', () => {
    expect(classifyMatchType('buy_electronic', 'distributor', 'HIGH')).toBe('Distributor SKU')
  })

  it('returns Custom fabricator for make_custom_fab + HIGH confidence', () => {
    expect(classifyMatchType('make_custom_fab', 'corpus', 'HIGH')).toBe('Custom fabricator')
  })

  it('returns Authorised reseller for named_manufacturer_reseller', () => {
    expect(classifyMatchType('named_manufacturer_reseller', 'corpus', 'MEDIUM')).toBe('Authorised reseller')
  })

  it('returns Certification body for service_certification', () => {
    expect(classifyMatchType('service_certification', 'registry', 'LOW')).toBe('Certification body')
  })

  it('returns Speculative match for default cases', () => {
    expect(classifyMatchType('buy_mechanical_industrial', 'corpus', 'LOW')).toBe('Speculative match')
    expect(classifyMatchType('make_custom_fab', 'corpus', 'LOW')).toBe('Speculative match')
  })
})
