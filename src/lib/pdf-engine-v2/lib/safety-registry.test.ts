import { checkSafetyRequirements } from './safety-registry'

describe('checkSafetyRequirements', () => {
  it('returns full coverage for energy_storage when all search terms are present', () => {
    const bomText = 'thermal runaway detection module, fire suppression system, G99 protection relay, IEC 62619 cell safety, fuse and circuit breaker overcurrent protection'
    const moduleText = ''

    const result = checkSafetyRequirements('energy_storage', bomText, moduleText)

    expect(result.productClass).toBe('energy_storage')
    expect(result.total).toBe(4)
    expect(result.addressed).toBe(4)
    expect(result.gaps).toHaveLength(0)
    expect(result.coveragePercent).toBe(100)
  })

  it('returns partial coverage for drone when only some terms match', () => {
    // Matches drone-02 (un 38.3) but not drone-01 (remote id) or drone-03 (cap 722)
    const bomText = 'Lithium polymer battery pack — passed UN 38.3 transport test certification'
    const moduleText = 'GPS navigation module with IMU'

    const result = checkSafetyRequirements('drone', bomText, moduleText)

    expect(result.total).toBe(3)
    expect(result.addressed).toBe(1)
    expect(result.gaps).toHaveLength(2)
    expect(result.gaps.map(g => g.id)).toEqual(expect.arrayContaining(['drone-01', 'drone-03']))
    expect(result.coveragePercent).toBe(33)
  })

  it('returns 100% coverage for an unknown product class (no requirements to check)', () => {
    const result = checkSafetyRequirements('quantum_computer', 'anything', 'anything')

    expect(result.total).toBe(0)
    expect(result.addressed).toBe(0)
    expect(result.gaps).toHaveLength(0)
    expect(result.coveragePercent).toBe(100)
  })

  it('returns 0% coverage when text is empty but requirements exist', () => {
    const result = checkSafetyRequirements('energy_storage', '', '')

    expect(result.total).toBe(4)
    expect(result.addressed).toBe(0)
    expect(result.gaps).toHaveLength(4)
    expect(result.coveragePercent).toBe(0)
  })
})
