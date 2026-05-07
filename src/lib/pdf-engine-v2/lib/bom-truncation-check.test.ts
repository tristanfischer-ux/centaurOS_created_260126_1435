import { checkBomTruncation } from './bom-truncation-check'

describe('checkBomTruncation', () => {
  // ─── Known class, truncated ───────────────────────────────────────

  it('detects truncation when energy_storage has only 3 parts (floor is 15)', () => {
    const result = checkBomTruncation('energy_storage', 3)
    expect(result.isTruncated).toBe(true)
    expect(result.expected).toBe(15)
    expect(result.actual).toBe(3)
    expect(result.message).toContain('3 parts')
    expect(result.message).toContain('15 expected')
    expect(result.message).toContain('possible truncation')
  })

  // ─── Known class, above floor ─────────────────────────────────────

  it('passes when energy_storage has 20 parts', () => {
    const result = checkBomTruncation('energy_storage', 20)
    expect(result.isTruncated).toBe(false)
    expect(result.expected).toBe(15)
    expect(result.actual).toBe(20)
    expect(result.message).toContain('meets minimum')
  })

  // ─── Known class, at floor ────────────────────────────────────────

  it('passes when drone has exactly 10 parts (floor is 10)', () => {
    const result = checkBomTruncation('drone', 10)
    expect(result.isTruncated).toBe(false)
    expect(result.expected).toBe(10)
    expect(result.actual).toBe(10)
  })

  // ─── Unknown class, truncated ─────────────────────────────────────

  it('detects truncation for unknown class with 3 parts (floor is 5)', () => {
    const result = checkBomTruncation('quantum_widget', 3)
    expect(result.isTruncated).toBe(true)
    expect(result.expected).toBe(5)
    expect(result.actual).toBe(3)
    expect(result.message).toContain('quantum_widget')
  })

  // ─── Unknown class, above floor ───────────────────────────────────

  it('passes for unknown class with 10 parts', () => {
    const result = checkBomTruncation('quantum_widget', 10)
    expect(result.isTruncated).toBe(false)
    expect(result.expected).toBe(5)
    expect(result.actual).toBe(10)
  })
})
