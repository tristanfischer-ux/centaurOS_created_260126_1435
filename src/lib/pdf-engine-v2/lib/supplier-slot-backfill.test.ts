import { pickBackfillCandidates, extractApex } from './supplier-slot-backfill'

// ─── extractApex ─────────────────────────────────────────────────────────────

describe('extractApex', () => {
  it('strips www and returns registrable domain', () => {
    expect(extractApex('https://www.sartorius.com/foo')).toBe('sartorius.com')
  })

  it('handles co.uk two-label suffix', () => {
    expect(extractApex('https://www.acme.co.uk/products')).toBe('acme.co.uk')
  })

  it('returns empty string for null', () => {
    expect(extractApex(null)).toBe('')
  })

  it('returns empty string for invalid URL', () => {
    expect(extractApex('not-a-url')).toBe('')
  })
})

// ─── pickBackfillCandidates ───────────────────────────────────────────────────

interface SimpleCand {
  name: string
  website_url: string | null
  llm_score: number | null
}

function cand(name: string, url: string | null, score: number | null): SimpleCand {
  return { name, website_url: url, llm_score: score }
}

describe('pickBackfillCandidates', () => {
  it('fills empty slot from retained pool when no conflicts', () => {
    const pool = [
      cand('Acme', 'https://acme.com', 8),
      cand('Beta', 'https://beta.com', 7),
    ]
    const result = pickBackfillCandidates(pool, new Set(), new Set(), 1)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Acme')
  })

  it('fills multiple slots in score order', () => {
    const pool = [
      cand('Alpha', 'https://alpha.com', 9),
      cand('Beta', 'https://beta.com', 8),
      cand('Gamma', 'https://gamma.com', 7),
    ]
    const result = pickBackfillCandidates(pool, new Set(), new Set(), 2)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Alpha')
    expect(result[1].name).toBe('Beta')
  })

  it('skips candidates whose apex is already in committedApexes', () => {
    const pool = [
      cand('Acme', 'https://acme.com', 8),
      cand('Beta', 'https://beta.com', 7),
    ]
    // acme.com is already committed in this slot
    const result = pickBackfillCandidates(pool, new Set(['acme.com']), new Set(), 1)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Beta')
  })

  it('skips candidates whose apex is in another archetype (cross-dedup invariant)', () => {
    const pool = [
      cand('Acme', 'https://acme.com', 8),
      cand('Beta', 'https://beta.com', 7),
    ]
    // acme.com already committed to another archetype
    const result = pickBackfillCandidates(pool, new Set(), new Set(['acme.com']), 1)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Beta')
  })

  it('returns empty array when pool is exhausted before filling all needed slots', () => {
    // Only 1 candidate in pool, need 2
    const pool = [cand('Only', 'https://only.com', 7)]
    const result = pickBackfillCandidates(pool, new Set(), new Set(), 2)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Only')
  })

  it('returns empty array when pool is empty (honest exhaustion)', () => {
    const result = pickBackfillCandidates([], new Set(), new Set(), 2)
    expect(result).toHaveLength(0)
  })

  it('does not double-pick the same domain within a single backfill call', () => {
    const pool = [
      cand('Acme Main', 'https://acme.com', 9),
      cand('Acme Products', 'https://shop.acme.com', 8),
      cand('Beta', 'https://beta.com', 7),
    ]
    // shop.acme.com and acme.com share the same apex — only one should be picked
    const result = pickBackfillCandidates(pool, new Set(), new Set(), 2)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Acme Main')
    expect(result[1].name).toBe('Beta')
  })

  it('handles candidates with null website_url (no apex) without filtering them out', () => {
    const pool = [
      cand('NoUrl', null, 8),
      cand('WithUrl', 'https://withurl.com', 7),
    ]
    // Null-URL candidates have apex '' which never collides — they pass through.
    const result = pickBackfillCandidates(pool, new Set(), new Set(), 2)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('NoUrl')
  })

  it('returns 0 when needed is 0', () => {
    const pool = [cand('Alpha', 'https://alpha.com', 9)]
    expect(pickBackfillCandidates(pool, new Set(), new Set(), 0)).toHaveLength(0)
  })
})
