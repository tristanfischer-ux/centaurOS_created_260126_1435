/**
 * @file fe-front-stamp-fpk-db-reads.ts
 * @description Production TypeScript consumer stamp for FPK forge-truth reads.
 *
 * INTENT: Prove the *real* TS APIs (lookupFpkClaims / getMaterialPrice) are
 * callable — not just that Python can SELECT. Writes twin artefact + exits
 * non-zero if hits are below floors.
 *
 * Usage (Node 22 — better-sqlite3 ABI):
 *   /opt/homebrew/opt/node@22/bin/node --import tsx \
 *     scripts/fe-front-stamp-fpk-db-reads.ts \
 *     --twin out/formula-e-front-mgu-20260729-1432
 */
import { writeFileSync, existsSync, readFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { getMaterialPrice } from '../src/lib/pdf-engine-v2/lib/material-prices'
import {
  lookupFpkClaims,
  lookupFpkComponentLiterature,
} from '../src/lib/pdf-engine-v2/lib/knowledge/fpk-literature-search'

const MATERIALS = [
  'ndfeb_magnet',
  'copper',
  'aluminium',
  'silicon_carbide_die',
  'electrical_steel',
  'gear_steel',
  'egw_coolant_50',
  'sintered_silver_die_attach',
] as const

function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function main(): void {
  const twin = resolve(argValue('--twin', 'out/formula-e-front-mgu-20260729-1432'))
  const matHits: Record<string, unknown> = {}
  for (const m of MATERIALS) {
    const p = getMaterialPrice(m)
    if (p) matHits[m] = p
  }
  const formulas = lookupFpkClaims({ claimKind: 'formula', k: 30 })
  const geometry = lookupFpkClaims({ claimKind: 'geometry', k: 30 })
  const materials = lookupFpkClaims({ claimKind: 'material', k: 20 })
  const statorLit = lookupFpkComponentLiterature({ componentId: 'stator', k: 8 })
  const statorClaims = lookupFpkClaims({ componentId: 'stator', k: 12 })

  const stamp = {
    schema: 'fpk-db-reads-ts/v1',
    consumer: 'scripts/fe-front-stamp-fpk-db-reads.ts',
    apis: [
      'getMaterialPrice',
      'lookupFpkClaims',
      'lookupFpkComponentLiterature',
    ],
    stamped_at: new Date().toISOString(),
    material_price_hit_count: Object.keys(matHits).length,
    material_price_hits: matHits,
    formula_claim_count: formulas.length,
    geometry_claim_count: geometry.length,
    material_claim_count: materials.length,
    stator_literature_count: statorLit.length,
    stator_claim_count: statorClaims.length,
    sample_formula_symbols: formulas.slice(0, 12).map((c) => c.symbol),
    sample_geometry_symbols: geometry.slice(0, 12).map((c) => c.symbol),
  }

  const floors = {
    materials: stamp.material_price_hit_count >= 6,
    formulas: stamp.formula_claim_count >= 10,
    geometry: stamp.geometry_claim_count >= 5,
    stator_lit: stamp.stator_literature_count >= 1,
  }
  const ok = Object.values(floors).every(Boolean)

  const outPath = resolve(twin, 'JLR-FE-FRONT-FPK-DB-READS-TS.json')
  writeFileSync(outPath, JSON.stringify({ ...stamp, floors, ok }, null, 2) + '\n')

  const statePath = resolve(twin, 'state.json')
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
    state.fpkDbReadsTs = {
      schema: stamp.schema,
      stamped_at: stamp.stamped_at,
      ok,
      floors,
      material_price_hit_count: stamp.material_price_hit_count,
      formula_claim_count: stamp.formula_claim_count,
      geometry_claim_count: stamp.geometry_claim_count,
      stator_literature_count: stamp.stator_literature_count,
      consumer: stamp.consumer,
    }
    const tmp = statePath + `.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
    renameSync(tmp, statePath)
  }

  console.log(
    JSON.stringify(
      {
        ok,
        floors,
        material_price_hit_count: stamp.material_price_hit_count,
        formula_claim_count: stamp.formula_claim_count,
        geometry_claim_count: stamp.geometry_claim_count,
        out: outPath,
      },
      null,
      2,
    ),
  )
  process.exit(ok ? 0 : 1)
}

main()
