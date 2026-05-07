import {
  buildReverseIndexes,
  companiesByProcess,
  companiesByMaterial,
  getReverseIndexStats,
  isReverseIndexAvailable,
} from './reverse-indexes'

// These tests exercise against the REAL nightshift.db on disk. They skip
// gracefully when it's not present (CI / other Macs). Not a unit test in
// the pure sense — it's an integration smoke test that the reader and
// the in-memory build work end-to-end.
const available = isReverseIndexAvailable()
const describeIfAvailable = available ? describe : describe.skip

describe('reverse-indexes (integration against nightshift.db)', () => {
  if (!available) {
    it('skipped — nightshift.db not present on this machine', () => {
      expect(true).toBe(true)
    })
    return
  }

  it('builds quickly (<10s) and returns non-empty stats', () => {
    const stats = getReverseIndexStats()
    expect(stats.available).toBe(true)
    expect(stats.processKeys).toBeGreaterThan(10)
    expect(stats.materialKeys).toBeGreaterThan(10)
    expect(stats.buildMs).toBeLessThan(10000)
  })

  it('returns >=1 company for a common process like "cnc machining"', () => {
    const hits = companiesByProcess('cnc machining')
    // Liberal expectation — real corpus should have many hits.
    expect(hits.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty for gibberish process name', () => {
    const hits = companiesByProcess('zzx_not_a_real_process_qqx')
    expect(hits).toEqual([])
  })

  it('handles empty / null input gracefully', () => {
    expect(companiesByProcess('')).toEqual([])
    expect(companiesByMaterial('')).toEqual([])
  })

  it('caps at maxResults', () => {
    const hits = companiesByProcess('cnc machining', 5)
    expect(hits.length).toBeLessThanOrEqual(5)
  })
})

// Pure unit tests that don't depend on a real DB.
describe('reverse-indexes (pure)', () => {
  it('exports the expected public API', () => {
    expect(typeof buildReverseIndexes).toBe('function')
    expect(typeof companiesByProcess).toBe('function')
    expect(typeof companiesByMaterial).toBe('function')
    expect(typeof getReverseIndexStats).toBe('function')
    expect(typeof isReverseIndexAvailable).toBe('function')
  })
})
