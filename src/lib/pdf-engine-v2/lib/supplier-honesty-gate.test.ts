import { gateSupplierMatch } from './supplier-honesty-gate'

describe('gateSupplierMatch', () => {
  it('gates out electronic part with non-electronic fabricator', () => {
    const result = gateSupplierMatch(
      { name: 'MCU', regime: 'buy_electronic' },
      { name: 'Sheet Metal Co', score: 90, processes: ['sheet metal', 'welding'] }
    )
    expect(result.includeInShortlist).toBe(false)
    expect(result.reason).toBe('Electronic parts should use distributor path, not fabricator')
  })

  it('includes custom fab with good score', () => {
    const result = gateSupplierMatch(
      { name: 'Bracket', regime: 'make_custom_fab' },
      { name: 'Sheet Metal Co', score: 60 }
    )
    expect(result.includeInShortlist).toBe(true)
  })

  it('gates out custom fab with low score', () => {
    const result = gateSupplierMatch(
      { name: 'Bracket', regime: 'make_custom_fab' },
      { name: 'Sheet Metal Co', score: 40 }
    )
    expect(result.includeInShortlist).toBe(false)
    expect(result.reason).toBe('Match score too low')
  })

  it('always includes service certification', () => {
    const result = gateSupplierMatch(
      { name: 'CE Mark', regime: 'service_certification' },
      { name: 'TUV', score: 10 }
    )
    expect(result.includeInShortlist).toBe(true)
  })
})
