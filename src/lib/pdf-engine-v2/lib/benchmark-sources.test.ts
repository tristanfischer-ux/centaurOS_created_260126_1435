import {
  loadCorpusBenchmarks,
  getMergedAnchors,
  isLiveBenchmarkSearchEnabled,
  shouldTriggerLiveBenchmarkSearch,
  L3_TRIGGER_THRESHOLD,
  type BenchmarkAnchor,
} from './benchmark-sources'

describe('benchmark-sources', () => {
  describe('loadCorpusBenchmarks', () => {
    it('returns an array (possibly empty)', () => {
      const anchors = loadCorpusBenchmarks()
      expect(Array.isArray(anchors)).toBe(true)
    })

    it('cached on second call', () => {
      const a = loadCorpusBenchmarks()
      const b = loadCorpusBenchmarks()
      expect(a).toBe(b) // reference-identical
    })
  })

  describe('getMergedAnchors', () => {
    const fakeL1: BenchmarkAnchor[] = [
      {
        productClass: 'battery_energy_storage',
        low: 150000,
        typical: 250000,
        high: 400000,
        unit: 'per MWh ex-works',
        source: 'BloombergNEF 2024',
        sourceType: 'L1_curated',
      },
      {
        productClass: 'vertical_farm_horticulture',
        low: 40000,
        typical: 60000,
        high: 120000,
        unit: 'per unit',
        source: 'AHDB 2023',
        sourceType: 'L1_curated',
      },
    ]

    it('returns the L1 anchors for a matching class', () => {
      const merged = getMergedAnchors('battery_energy_storage', fakeL1)
      expect(merged).toContainEqual(fakeL1[0])
    })

    it('is case-insensitive on productClass', () => {
      const merged = getMergedAnchors('BATTERY_ENERGY_STORAGE', fakeL1)
      expect(merged).toContainEqual(fakeL1[0])
    })

    it('returns empty for a class with no matching anchors', () => {
      const merged = getMergedAnchors('nonexistent_class', fakeL1)
      expect(merged).toEqual([])
    })
  })

  describe('isLiveBenchmarkSearchEnabled', () => {
    const savedEnv = process.env.ENABLE_LIVE_BENCHMARK_SEARCH

    afterEach(() => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = savedEnv
    })

    it('returns false by default', () => {
      delete process.env.ENABLE_LIVE_BENCHMARK_SEARCH
      expect(isLiveBenchmarkSearchEnabled()).toBe(false)
    })

    it('returns true when env var is explicitly "true"', () => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = 'true'
      expect(isLiveBenchmarkSearchEnabled()).toBe(true)
    })

    it('returns false for any other env value', () => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = '1'
      expect(isLiveBenchmarkSearchEnabled()).toBe(false)
    })
  })

  describe('shouldTriggerLiveBenchmarkSearch', () => {
    const savedEnv = process.env.ENABLE_LIVE_BENCHMARK_SEARCH

    afterEach(() => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = savedEnv
    })

    it('never triggers when the feature is disabled', () => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = 'false'
      expect(shouldTriggerLiveBenchmarkSearch('battery_energy_storage', [])).toBe(false)
    })

    it('triggers when L1 is sparse and feature is enabled', () => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = 'true'
      expect(shouldTriggerLiveBenchmarkSearch('niche_product', [])).toBe(true)
    })

    it('does NOT trigger when L1 has enough anchors', () => {
      process.env.ENABLE_LIVE_BENCHMARK_SEARCH = 'true'
      const rich: BenchmarkAnchor[] = Array.from({ length: L3_TRIGGER_THRESHOLD + 2 }, (_, i) => ({
        productClass: 'rich_class',
        low: 100, typical: 200, high: 300,
        unit: `per unit ${i}`,
        source: `src ${i}`,
        sourceType: 'L1_curated' as const,
      }))
      expect(shouldTriggerLiveBenchmarkSearch('rich_class', rich)).toBe(false)
    })
  })
})
