import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { resolveVerifiedFunctionCandidate } from './pcb-verified-candidates'

import type { DbCascadeResult } from '../distributors/db-only-cascade'
import type { VerifiedCandidateRequest } from './pcb-verified-candidates'

interface AcceptedMapping {
  punchlistId: string
  resolverRequest: VerifiedCandidateRequest
  manufacturer: string
  partNumber: string
  roleCompatibility: string
  package: string
  ratings: string
  symbolPinout: string
  manufacturerEvidence: string
  databaseEvidence: string
}

interface ProductSummary {
  product: string
  requiredBoards: number
  resolvedDelta: number
  remainingUnresolved: number
}

interface ResolutionReport {
  schema: string
  baseline: {
    verifiedIdentityCount: number
    unresolvedIdentityCount: number
    missingMpn: number
    missingSymbolPinout: number
  }
  acceptedMappings: AcceptedMapping[]
  sevenProductSummary: ProductSummary[]
  updatedSummary: {
    products: number
    requiredBoards: number
    verifiedIdentityCount: number
    unresolvedIdentityCount: number
    resolvedDelta: number
    missingMpn: number
    missingSymbolPinout: number
  }
  remainingCategoryCounts: Record<string, number>
  limitations: string[]
}

interface PunchlistEntry {
  id: string
}

interface Punchlist {
  roleGroups: Array<{
    universalFunctionRole: string
    entries: PunchlistEntry[]
  }>
}

const WORKTREE_ROOT = resolve(__dirname, '../../../../../')
const REPORT_PATH = resolve(
  WORKTREE_ROOT,
  'tests/fixtures/pcb/yuri/identity-resolution-report.json',
)
const PUNCHLIST_PATH = resolve(
  __dirname,
  'pcb-unresolved-component-punchlist.json',
)

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('offline seven-product PCB identity resolution report', () => {
  it('reconciles every accepted mapping and remaining category against the 50-item baseline', () => {
    const report = readJson<ResolutionReport>(REPORT_PATH)
    const punchlist = readJson<Punchlist>(PUNCHLIST_PATH)
    const acceptedIds = new Set(report.acceptedMappings.map((mapping) => mapping.punchlistId))
    const baselineIds = new Set(
      punchlist.roleGroups.flatMap((group) => group.entries.map((entry) => entry.id)),
    )

    expect(report.schema).toBe('pcb-yuri-identity-resolution-report/v1')
    expect(report.acceptedMappings).toHaveLength(3)
    expect([...acceptedIds].every((id) => baselineIds.has(id))).toBe(true)
    expect(report.sevenProductSummary).toHaveLength(7)
    expect(report.sevenProductSummary.reduce(
      (total, product) => total + product.requiredBoards,
      0,
    )).toBe(8)
    expect(report.sevenProductSummary.reduce(
      (total, product) => total + product.resolvedDelta,
      0,
    )).toBe(report.updatedSummary.resolvedDelta)
    expect(report.sevenProductSummary.reduce(
      (total, product) => total + product.remainingUnresolved,
      0,
    )).toBe(report.updatedSummary.unresolvedIdentityCount)

    const remainingCategoryCounts = Object.fromEntries(
      punchlist.roleGroups.map((group) => [
        group.universalFunctionRole,
        group.entries.filter((entry) => !acceptedIds.has(entry.id)).length,
      ]),
    )
    expect(report.remainingCategoryCounts).toEqual(remainingCategoryCounts)
    expect(Object.values(report.remainingCategoryCounts).reduce(
      (total, count) => total + count,
      0,
    )).toBe(report.updatedSummary.unresolvedIdentityCount)
  })

  it('links every reported acceptance to the function-keyed resolver and complete evidence', () => {
    const report = readJson<ResolutionReport>(REPORT_PATH)

    for (const mapping of report.acceptedMappings) {
      const lookup = (): DbCascadeResult => ({
        found: true,
        result: {
          source: 'digikey',
          mpn: mapping.partNumber,
          manufacturer: mapping.manufacturer,
          description: mapping.package,
          priceGBP: [],
          stockUK: null,
          datasheetUrl: null,
          productUrl: '',
          leadWeeks: null,
          fetchedAt: '2026-07-18T00:00:00.000Z',
        },
        source: 'cache_hit',
        ageHours: 1,
      })
      const resolved = resolveVerifiedFunctionCandidate(mapping.resolverRequest, lookup)

      expect(resolved).toMatchObject({
        manufacturer: mapping.manufacturer,
        partNumber: mapping.partNumber,
      })
      expect(mapping.roleCompatibility.trim()).not.toBe('')
      expect(mapping.package.trim()).not.toBe('')
      expect(mapping.ratings.trim()).not.toBe('')
      expect(mapping.symbolPinout).toMatch(/:/)
      expect(mapping.manufacturerEvidence.trim()).not.toBe('')
      expect(mapping.databaseEvidence).toContain('forge-truth')
    }
  })

  it('reports the exact honest delta without claiming a pipeline rerun', () => {
    const report = readJson<ResolutionReport>(REPORT_PATH)

    expect(report.updatedSummary).toEqual({
      products: 7,
      requiredBoards: 8,
      verifiedIdentityCount: report.baseline.verifiedIdentityCount + 3,
      unresolvedIdentityCount: report.baseline.unresolvedIdentityCount - 3,
      resolvedDelta: 3,
      missingMpn: report.baseline.missingMpn - 2,
      missingSymbolPinout: report.baseline.missingSymbolPinout - 1,
    })
    expect(report.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining('no terminal-owned chain'),
      expect.stringContaining('12 V rail exceeds'),
      expect.stringContaining('No candidate without'),
    ]))
  })
})
