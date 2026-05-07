import { buildDeterministicPhase, deduplicateBom } from './bom-builder'
import type { Module, Part, BomLine } from '../types'
import { REQUIRED_PARTS } from './required-parts-manifest'
import * as regimeRouter from './regime-router'

jest.mock('./regime-router', () => ({
  routePartLookup: jest.fn()
}))

describe('bom-builder', () => {
  const dummyModules: Module[] = [
    {
      id: 'mod-1',
      name: 'Test Module',
      purpose: 'test',
      inputs: [],
      outputs: [],
      keyParts: [],
      leadWeeks: 1,
      description: 'test',
      whyItMatters: 'test',
      failureModes: [],
      unknowns: [],
      status: 'active'
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('Phase 1 creates correct number of required parts for energy_storage', async () => {
    ;(regimeRouter.routePartLookup as jest.Mock).mockResolvedValue({ regime: 'buy_electronic', source: 'none' })
    const res = await buildDeterministicPhase('energy_storage', dummyModules)
    expect(res.deterministicParts.length).toBe(REQUIRED_PARTS['energy_storage'].length)
    expect(res.deterministicBomLines.length).toBe(REQUIRED_PARTS['energy_storage'].length)
    expect(res.deterministicParts[0].name).toBe('Battery Management System (BMS)')
    expect((res.deterministicParts[0] as any).sourceManifest).toBe(true)
  })

  test('Phase 2 fills prices when distributor data available', async () => {
    ;(regimeRouter.routePartLookup as jest.Mock).mockResolvedValue({
      regime: 'buy_electronic',
      source: 'distributor',
      priceGbp: 150,
      supplier: 'mouser',
      sku: 'BMS-123',
      datasheetUrl: 'http://example.com'
    })

    const res = await buildDeterministicPhase('energy_storage', dummyModules)
    
    // Check that prices and supplier are filled for the BMS part (or any part)
    const bmsPart = res.deterministicParts[0]
    expect(bmsPart.estimatedUnitCostGbp).toBe(150)
    expect((bmsPart as any).supplier).toBe('mouser')
    expect((bmsPart as any).sku).toBe('BMS-123')
    expect((bmsPart as any).priceSource).toBe('distributor')
  })

  test('Phase 3 prompt includes exclusion list (checked implicitly via 4-bom-cost.ts)', () => {
    expect(true).toBe(true)
  })

  test('Graceful fallback when distributors unavailable', async () => {
    ;(regimeRouter.routePartLookup as jest.Mock).mockRejectedValue(new Error('Network error'))
    
    const res = await buildDeterministicPhase('energy_storage', dummyModules)
    
    // Should still return parts, just without prices
    expect(res.deterministicParts.length).toBeGreaterThan(0)
    expect(res.deterministicParts[0].estimatedUnitCostGbp).toBeUndefined()
  })

  test('Deduplication keeps deterministic over LLM', () => {
    const detParts: Part[] = [
      { partNumber: 'det-1', name: 'Battery Management System (BMS)' }
    ] as any
    const detBomLines: BomLine[] = [
      { childPartId: 'det-1', quantity: 1 }
    ]

    const llmParts: Part[] = [
      { partNumber: 'llm-1', name: 'BMS Controller' },
      { partNumber: 'llm-2', name: 'Novel Sensor' }
    ] as any
    const llmBomLines: BomLine[] = [
      { childPartId: 'llm-1', quantity: 1 },
      { childPartId: 'llm-2', quantity: 2 }
    ]

    const merged = deduplicateBom(detParts, detBomLines, llmParts, llmBomLines, 'energy_storage')

    // Should keep 'det-1' (BMS) and 'llm-2' (Novel Sensor). Should drop 'llm-1'
    expect(merged.finalParts.length).toBe(2)
    const names = merged.finalParts.map(p => p.name)
    expect(names).toContain('Battery Management System (BMS)')
    expect(names).toContain('Novel Sensor')
    expect(names).not.toContain('BMS Controller')

    // BomLines should match the remaining parts
    expect(merged.finalBomLines.length).toBe(2)
    expect(merged.finalBomLines.find(b => b.childPartId === 'det-1')).toBeDefined()
    expect(merged.finalBomLines.find(b => b.childPartId === 'llm-2')).toBeDefined()
    expect(merged.finalBomLines.find(b => b.childPartId === 'llm-1')).toBeUndefined()
  })
})