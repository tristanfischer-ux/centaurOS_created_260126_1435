import {
  normaliseState,
  safeNumber,
  safeString,
  safeArray,
  fmtOrDash,
  fmtGbpOrDash,
} from './safe-state'
import type { PipelineState } from '../types'

describe('safe-state', () => {
  describe('normaliseState', () => {
    it('substitutes empty arrays for missing collections', () => {
      const state: Partial<PipelineState> = {
        projectId: 'test',
        research: null,
        modules: null as any,
        parts: undefined as any,
        bomLines: [],
        costBreakdown: null,
        reviews: null as any,
        suppliers: undefined as any,
        proofreadFindings: null,
        sourceAttributions: null as any,
        llmAttributions: undefined as any,
        sectionScores: [],
        dimensionSheet: null,
      }
      const safe = normaliseState(state as PipelineState)
      expect(safe.modules).toEqual([])
      expect(safe.parts).toEqual([])
      expect(safe.reviews).toEqual([])
      expect(safe.suppliers).toEqual([])
      expect(safe.sourceAttributions).toEqual([])
      expect(safe.llmAttributions).toEqual([])
    })

    it('returns fallback shape for null state', () => {
      const safe = normaliseState(null)
      expect(safe.projectId).toBe('unknown')
      expect(safe.modules).toEqual([])
      expect(safe.research).toBeNull()
      expect(safe.costBreakdown).toBeNull()
    })

    it('returns fallback shape for undefined state', () => {
      const safe = normaliseState(undefined)
      expect(safe.projectId).toBe('unknown')
      expect(safe.modules).toEqual([])
    })

    it('preserves populated arrays without copying', () => {
      const modules = [{ id: 'a' } as any]
      const state: Partial<PipelineState> = {
        projectId: 'test',
        modules,
        parts: [],
        bomLines: [],
        reviews: [],
        suppliers: [],
        research: null,
        dimensionSheet: null,
        costBreakdown: null,
        proofreadFindings: null,
        sourceAttributions: [],
        llmAttributions: [],
        sectionScores: [],
      }
      const safe = normaliseState(state as PipelineState)
      expect(safe.modules).toBe(modules)
    })
  })

  describe('safeNumber', () => {
    it('accepts finite numbers', () => {
      expect(safeNumber(42)).toBe(42)
      expect(safeNumber(0)).toBe(0)
      expect(safeNumber(-1.5)).toBe(-1.5)
    })

    it('rejects non-finite numbers', () => {
      expect(safeNumber(NaN)).toBeNull()
      expect(safeNumber(Infinity)).toBeNull()
      expect(safeNumber(-Infinity)).toBeNull()
    })

    it('rejects null and undefined', () => {
      expect(safeNumber(null)).toBeNull()
      expect(safeNumber(undefined)).toBeNull()
    })

    it('parses numeric strings with commas', () => {
      expect(safeNumber('1,234')).toBe(1234)
      expect(safeNumber('1,234.56')).toBe(1234.56)
    })

    it('rejects Yoga sentinel (|n| > 1e15)', () => {
      // PostgREST can return -8e21 / +9e21 for timeout-bumped numeric fields
      // that crash @react-pdf/renderer's Yoga layout engine.
      expect(safeNumber(-8e21)).toBeNull()
      expect(safeNumber(9.99e20)).toBeNull()
      // But real engineering numbers up to 1e15 are fine.
      expect(safeNumber(1e14)).toBe(1e14)
    })

    it('rejects empty / dash strings', () => {
      expect(safeNumber('')).toBeNull()
      expect(safeNumber('—')).toBeNull()
      expect(safeNumber('-')).toBeNull()
    })

    it('rejects non-numeric, non-string types', () => {
      expect(safeNumber({})).toBeNull()
      expect(safeNumber([])).toBeNull()
      expect(safeNumber(true)).toBeNull()
    })
  })

  describe('safeString', () => {
    it('returns empty string for null/undefined', () => {
      expect(safeString(null)).toBe('')
      expect(safeString(undefined)).toBe('')
    })

    it('coerces numbers and booleans', () => {
      expect(safeString(42)).toBe('42')
      expect(safeString(true)).toBe('true')
    })

    it('passes through strings', () => {
      expect(safeString('hello')).toBe('hello')
      expect(safeString('')).toBe('')
    })
  })

  describe('safeArray', () => {
    it('returns array for array input', () => {
      expect(safeArray([1, 2, 3])).toEqual([1, 2, 3])
    })

    it('returns empty for non-array', () => {
      expect(safeArray(null)).toEqual([])
      expect(safeArray(undefined)).toEqual([])
      expect(safeArray('string')).toEqual([])
      expect(safeArray(42)).toEqual([])
    })
  })

  describe('fmtOrDash', () => {
    it('returns dash for null/undefined', () => {
      expect(fmtOrDash(null)).toBe('—')
      expect(fmtOrDash(undefined)).toBe('—')
      expect(fmtOrDash(NaN)).toBe('—')
    })

    it('appends suffix when provided', () => {
      expect(fmtOrDash(42, ' kg')).toBe('42 kg')
    })
  })

  describe('fmtGbpOrDash', () => {
    it('returns dash for null/undefined', () => {
      expect(fmtGbpOrDash(null)).toBe('—')
      expect(fmtGbpOrDash(undefined)).toBe('—')
    })

    it('formats numeric values as GBP', () => {
      expect(fmtGbpOrDash(1234.56)).toMatch(/£1,234\.56/)
      expect(fmtGbpOrDash(0)).toMatch(/£0\.00/)
    })
  })
})
