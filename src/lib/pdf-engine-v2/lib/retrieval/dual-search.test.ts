/**
 * dual-search.test.ts — unit tests for the shared hybrid-retrieval substrate.
 *
 * Pure-function coverage only (no DB, no network) so it runs under jsdom:
 *   1. Reciprocal Rank Fusion maths — the canonical 1/(k+rank0) formula, the
 *      "wins in two lists beats a slim win in one" property, absence→null
 *      ranks, and deterministic tie-breaking.
 *   2. parseEmbedding for BOTH storage formats: 'f32le_blob' (Float32LE Buffer,
 *      the parts convention) and 'json_text' (JSON-array TEXT, supplier_embeddings),
 *      plus the malformed / wrong-length rejection paths.
 *   3. lexicalScore — an exact name-column hit outranks a buried description hit.
 *
 * Importing the module here pulls ONLY pure helpers; `dualSearch` lazy-requires
 * better-sqlite3, so the native binding is never loaded in this jsdom suite.
 */

import {
  rrfFuse,
  parseEmbedding,
  cosineSimilarity,
  tokenize,
  lexicalScore,
  RRF_K,
  EMBEDDING_DIMS,
  type RankedList,
} from './dual-search'

describe('rrfFuse — Reciprocal Rank Fusion maths', () => {
  it('computes score = Σ 1/(k+rank0) with the canonical k=60', () => {
    // Single list, two rows at ranks 0 and 1.
    const lists: RankedList[] = [{ label: 'lexical', ids: ['A', 'B'] }]
    const fused = rrfFuse(lists, 60)
    const a = fused.find((f) => f.id === 'A')!
    const b = fused.find((f) => f.id === 'B')!
    expect(a.rrf_score).toBeCloseTo(1 / 60, 12) // rank 0
    expect(b.rrf_score).toBeCloseTo(1 / 61, 12) // rank 1
    expect(a.ranks.lexical).toBe(0)
    expect(b.ranks.lexical).toBe(1)
    // Absent from any other list ⇒ that label is not present (single-list case).
    expect(Object.keys(a.ranks)).toEqual(['lexical'])
  })

  it('default k is the canonical 60', () => {
    expect(RRF_K).toBe(60)
    const fusedDefault = rrfFuse([{ label: 'l', ids: ['X'] }])
    expect(fusedDefault[0].rrf_score).toBeCloseTo(1 / 60, 12)
  })

  it('a row ranked in BOTH lists beats a row ranked top of only ONE (union of strengths)', () => {
    // BOTH: appears at rank 2 in lexical and rank 2 in semantic.
    // SOLO: appears at rank 0 in semantic only (a slightly better single rank).
    const lexical: RankedList = { label: 'lexical', ids: ['x0', 'x1', 'BOTH'] }
    const semantic: RankedList = { label: 'semantic', ids: ['SOLO', 's1', 'BOTH'] }
    const fused = rrfFuse([lexical, semantic], 60)

    const both = fused.find((f) => f.id === 'BOTH')!
    const solo = fused.find((f) => f.id === 'SOLO')!

    // BOTH = 1/62 + 1/62 ; SOLO = 1/60. Two mid hits beat one top hit.
    expect(both.rrf_score).toBeCloseTo(1 / 62 + 1 / 62, 12)
    expect(solo.rrf_score).toBeCloseTo(1 / 60, 12)
    expect(both.rrf_score).toBeGreaterThan(solo.rrf_score)
    // BOTH must be ranked first overall.
    expect(fused[0].id).toBe('BOTH')

    // Cross-list rank bookkeeping is correct + absence is explicit null.
    expect(both.ranks.lexical).toBe(2)
    expect(both.ranks.semantic).toBe(2)
    expect(solo.ranks.lexical).toBeNull()
    expect(solo.ranks.semantic).toBe(0)
  })

  it('records null ranks for rows missing from a list', () => {
    const fused = rrfFuse([
      { label: 'lexical', ids: ['onlyLex'] },
      { label: 'semantic', ids: ['onlySem'] },
    ])
    const lex = fused.find((f) => f.id === 'onlyLex')!
    const sem = fused.find((f) => f.id === 'onlySem')!
    expect(lex.ranks.lexical).toBe(0)
    expect(lex.ranks.semantic).toBeNull()
    expect(sem.ranks.lexical).toBeNull()
    expect(sem.ranks.semantic).toBe(0)
  })

  it('breaks score ties deterministically by id ASC', () => {
    // Both rows at rank 0 of their own single list → identical 1/60 score.
    const fused = rrfFuse([
      { label: 'a', ids: ['zebra'] },
      { label: 'b', ids: ['alpha'] },
    ])
    expect(fused[0].rrf_score).toBeCloseTo(fused[1].rrf_score, 12)
    expect(fused.map((f) => f.id)).toEqual(['alpha', 'zebra']) // id ASC tie-break
  })

  it('guards accidental duplicate ids within a single list (first rank wins)', () => {
    const fused = rrfFuse([{ label: 'l', ids: ['dup', 'dup', 'other'] }])
    const dup = fused.find((f) => f.id === 'dup')!
    // Only the first occurrence (rank 0) counts — not 1/60 + 1/61.
    expect(dup.rrf_score).toBeCloseTo(1 / 60, 12)
    expect(dup.ranks.l).toBe(0)
  })
})

describe('parseEmbedding — both storage formats', () => {
  const sample = Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i % 7) * 0.013 - 0.04)

  it("parses 'json_text' (supplier_embeddings: JSON-array TEXT)", () => {
    const cell = JSON.stringify(sample)
    const out = parseEmbedding(cell, 'json_text')
    expect(out).not.toBeNull()
    expect(out!.length).toBe(EMBEDDING_DIMS)
    // float64 JSON round-trip is exact.
    expect(out![0]).toBeCloseTo(sample[0], 12)
    expect(out![100]).toBeCloseTo(sample[100], 12)
  })

  it("parses 'f32le_blob' (pretraining_extracted_*: Float32LE Buffer)", () => {
    const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
    for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(sample[i], i * 4)
    const out = parseEmbedding(buf, 'f32le_blob')
    expect(out).not.toBeNull()
    expect(out!.length).toBe(EMBEDDING_DIMS)
    // float32 precision — looser tolerance than the JSON path.
    expect(out![0]).toBeCloseTo(sample[0], 5)
    expect(out![100]).toBeCloseTo(sample[100], 5)
  })

  it('a vector survives the json_text → f32le_blob round-trip with cosine ≈ 1', () => {
    const jsonOut = parseEmbedding(JSON.stringify(sample), 'json_text')!
    const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
    for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(sample[i], i * 4)
    const blobOut = parseEmbedding(buf, 'f32le_blob')!
    // Same underlying vector via two formats ⇒ near-identical direction.
    expect(cosineSimilarity(jsonOut, blobOut)).toBeGreaterThan(0.9999)
  })

  it('rejects malformed / wrong-length cells (returns null, never throws)', () => {
    expect(parseEmbedding(null, 'json_text')).toBeNull()
    expect(parseEmbedding(undefined, 'f32le_blob')).toBeNull()
    expect(parseEmbedding('not json', 'json_text')).toBeNull()
    expect(parseEmbedding(JSON.stringify([1, 2, 3]), 'json_text')).toBeNull() // wrong length
    expect(parseEmbedding(Buffer.alloc(16), 'f32le_blob')).toBeNull() // wrong byte length
    expect(parseEmbedding(JSON.stringify(['a', 'b']), 'json_text')).toBeNull() // non-finite
  })
})

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 12)
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 12)
    expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0) // zero vector guard
  })
})

describe('tokenize + lexicalScore', () => {
  it('drops stopwords + short tokens, dedupes, preserves order', () => {
    expect(tokenize('CNC machining for aerospace UK Ltd machining')).toEqual([
      'cnc', 'machining', 'aerospace',
    ])
  })

  it('ranks an exact name-column hit above a buried description hit', () => {
    const tokens = tokenize('Volytica diagnostics battery analytics')
    // Candidate A: name leads with the query term (position ~0).
    const a = lexicalScore('Volytica Diagnostics GmbH — battery state-of-health analytics', tokens)
    // Candidate B: term only deep in a long unrelated description.
    const b = lexicalScore(
      'Generic Components Co — ' + 'x'.repeat(400) + ' some battery mention',
      tokens,
    )
    expect(a).toBeGreaterThan(b)
    expect(a).toBeGreaterThan(0)
  })

  it('returns 0 when nothing matches', () => {
    expect(lexicalScore('totally unrelated text', tokenize('cnc machining'))).toBe(0)
    expect(lexicalScore('anything', [])).toBe(0)
  })
})
