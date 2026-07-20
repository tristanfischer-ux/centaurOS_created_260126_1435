/**
 * @file chain-must-be-db-only.test.ts
 *
 * Regression test: chain-side files MUST NOT import live distributor API
 * adapters (mouser, digikey, farnell, lcsc, nexar).
 *
 * CODIFIED 2026-05-25 (drawer_forgeos_decisions_e30f5e00a59dc3ff).
 * Every BESS chain (L23-L26) exhausted Mouser/Digi-Key/Nexar free-tier
 * quotas because gate 20, gate 21, and distributor-cascade-real.ts all
 * called live APIs for every BoM line (~200 calls/chain). This test
 * mechanically enforces the architectural boundary: only scripts/ingest/*
 * jobs may call live distributor APIs.
 *
 * HOW IT WORKS:
 * Reads each chain-side file as source text and checks for forbidden import
 * patterns. A failure here means someone added a live-API import to a
 * chain-side file. Fix: replace with lookupCached() from db-only-cascade.ts.
 *
 * FORBIDDEN IMPORTS in chain-side files:
 *   from '.+/distributors/(mouser|digikey|farnell|lcsc|nexar)'
 *   require('.+/distributors/(mouser|digikey|farnell|lcsc|nexar)')
 *   findSkuForPart  (from distributors/index.ts — calls live APIs)
 *
 * EXEMPT FILES (live-API imports are intentional here):
 *   src/lib/pdf-engine-v2/lib/distributors/*.ts  — the adapters themselves
 *   scripts/ingest/*                              — ingest jobs
 *   scripts/test-distributor-apis.ts             — manual test script
 *   scripts/ingest-distributor-catalogue.ts      — bulk sweep
 *   scripts/lib/background-enrichment.ts         — post-chain enrichment
 *
 * scripts/lib/part-reality-check.ts (Stage 10.5) was converted to DB-only on
 * 2026-07-07 (determinism #86 root 4 — live-catalogue lookups made
 * partVerifications prices jitter run-to-run on a cold twin) and is now
 * covered by CHAIN_SIDE_FILES_UNDER_TEST below like the other chain-side
 * gates.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Paths ─────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(__dirname, '../../../../..')

// Chain-side files that MUST NOT import live distributor adapters.
const CHAIN_SIDE_FILES_UNDER_TEST = [
  'scripts/lib/fictional-pn-audit.ts',
  'scripts/lib/per-line-price-plausibility-audit.ts',
  'scripts/lib/orchestrator/tools/distributor-cascade-real.ts',
  'scripts/lib/part-reality-check.ts',
  // PCB Phase B (2026-07-12): the atopile generator's MPN resolution tier uses
  // lookupCached() only — it must never hit a live distributor for footprint
  // derivation (it isn't the ingest path; that would burn quota per chain run).
  'src/lib/pdf-engine-v2/lib/pcb/atopile-generator.ts',
]

// Pattern that identifies a forbidden live-adapter import.
// Matches both static import and require() forms.
const FORBIDDEN_PATTERNS = [
  /from\s+['"][^'"]*\/distributors\/(mouser|digikey|farnell|lcsc|nexar)['"]/,
  /require\s*\([^)]*\/distributors\/(mouser|digikey|farnell|lcsc|nexar)/,
  /\bfindSkuForPart\b/,
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('chain-must-be-db-only', () => {
  for (const relPath of CHAIN_SIDE_FILES_UNDER_TEST) {
    const absPath = resolve(REPO_ROOT, relPath)

    it(`${relPath} — must not import live distributor adapters`, () => {
      expect(existsSync(absPath)).toBe(true)

      const source = readFileSync(absPath, 'utf-8')

      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = source.match(pattern)
        if (match) {
          throw new Error(
            `CHAIN-AS-DB-CONSUMER VIOLATION in ${relPath}\n` +
            `Forbidden pattern "${pattern.source}" matched: "${match[0]}"\n\n` +
            `This file must not import live distributor API adapters.\n` +
            `Replace with lookupCached() from db-only-cascade.ts.\n` +
            `See CLAUDE.md "CHAIN-AS-DB-CONSUMER PRINCIPLE" and\n` +
            `drawer_forgeos_decisions_e30f5e00a59dc3ff for the architecture rationale.\n\n` +
            `Live-API ingest jobs live in: scripts/ingest/*\n` +
            `Permitted chain-side lookup: src/lib/pdf-engine-v2/lib/distributors/db-only-cascade.ts`,
          )
        }
      }
    })
  }

  it('db-only-cascade.ts itself must not import live adapters (would create a cycle)', () => {
    const dbOnlyPath = resolve(REPO_ROOT, 'src/lib/pdf-engine-v2/lib/distributors/db-only-cascade.ts')
    expect(existsSync(dbOnlyPath)).toBe(true)

    const source = readFileSync(dbOnlyPath, 'utf-8')

    for (const pattern of FORBIDDEN_PATTERNS) {
      const match = source.match(pattern)
      if (match) {
        throw new Error(
          `db-only-cascade.ts imports a live adapter — this is a cycle violation.\n` +
          `Matched: "${match[0]}"\n` +
          `db-only-cascade.ts must only use better-sqlite3 to read forge-truth.db.`,
        )
      }
    }
  })

  it('A6: the DB-first READ path must NOT be gated by SKIP_LIBRARY_WRITEBACK', () => {
    // SKIP_LIBRARY_WRITEBACK exists to stop the chain WRITING to forge-truth.db (dry-runs,
    // tests). Coupling the readonly cascade READ (db-only-cascade.getDb) to it was a footgun:
    // a dry-run that set SKIP_LIBRARY_WRITEBACK=1 silently lost every DB-first read hit and
    // cratered BoM coverage. Reads now have their own opt-in (SKIP_LIBRARY_READS). This guard
    // fails if the writeback flag ever leaks back into the getDb() read gate.
    const dbOnlyPath = resolve(REPO_ROOT, 'src/lib/pdf-engine-v2/lib/distributors/db-only-cascade.ts')
    const source = readFileSync(dbOnlyPath, 'utf-8')
    // isolate the getDb() body (readonly handle) — the writeback flag must not appear as a gate there
    const getDbMatch = source.match(/function getDb\(\)[^{]*\{[\s\S]*?\n\}/)
    expect(getDbMatch).not.toBeNull()
    const getDbBody = getDbMatch![0]
    const gatesOnWriteback = /process\.env\.SKIP_LIBRARY_WRITEBACK\s*===\s*['"]1['"]/.test(getDbBody)
    if (gatesOnWriteback) {
      throw new Error(
        'A6 VIOLATION: db-only-cascade.getDb() (a READ path) gates on SKIP_LIBRARY_WRITEBACK.\n' +
        'That flag is for WRITE-back only; coupling reads to it craters BoM coverage on dry-runs.\n' +
        'Use SKIP_LIBRARY_READS for the read gate instead.',
      )
    }
    // and the intended read gate must be present
    expect(/process\.env\.SKIP_LIBRARY_READS\s*===\s*['"]1['"]/.test(getDbBody)).toBe(true)
  })

  it('scripts/ingest/* files are NOT subject to the chain-only rule (they may call live APIs)', () => {
    const ingestDir = resolve(REPO_ROOT, 'scripts/ingest')
    if (!existsSync(ingestDir)) {
      // Directory may not exist in all environments
      return
    }
    const ingestFiles = readdirSync(ingestDir).filter((f) => f.endsWith('.ts'))
    // Just confirm there are ingest files — they are exempt from the live-API prohibition
    // This test serves as a documentation assertion: if someone deletes all ingest files,
    // something is wrong architecturally.
    expect(ingestFiles.length).toBeGreaterThan(0)
  })
})
