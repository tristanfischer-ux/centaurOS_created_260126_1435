/**
 * scripts/fe-front-gap-literature-search.tsx
 *
 * Resolve a CAPABILITY GAP against the harvested literature using HYBRID
 * (vector + keyword) search — not the keyword matcher I hand-rolled.
 *
 * WHY (Tristan 2026-08-01): "why is it just keyword search and not vector plus
 * keyword — like I thought all the databases were."
 *
 * He was right, and it was the FOURTH instance in one session of building
 * instead of looking. `fpk_capability_gap_resolver.find_existing_solver()` did
 * naive token overlap on filenames and produced a FALSE match
 * (rotor_critical_speed_rpm -> iso6336_fia_front_kit_case.py; ISO 6336 is GEAR
 * RATING, not rotordynamics). Meanwhile `dualSearch` already existed over
 * corpora that were already harvested:
 *     fpk_component_literature  24,946 rows
 *     fpk_extracted_claims      32,453 rows
 *
 * This asks the literature how the INDUSTRY computes a duty, which is the step
 * that stops a generated tool inventing its own physics.
 *
 * Usage: npx tsx scripts/fe-front-gap-literature-search.tsx <duty_key> [...]
 */

import { resolve, join } from 'node:path'
import { homedir } from 'node:os'

const ROOT = resolve(__dirname, '..')
const DB = join(homedir(), '.forge-truth', 'forge-truth.db')

/** Physics phrasing for a duty key — literature does not speak snake_case. */
function queryTextFor(duty: string): string {
  const words = duty.replace(/_(mm|rpm|nm|kw|c|h|mpa|pct)$/i, '').split('_').join(' ')
  const extra: Record<string, string> = {
    rotor_critical_speed_rpm:
      'rotor critical speed whirl campbell diagram rotordynamics bending mode shaft',
    magnet_demagnetisation_margin:
      'permanent magnet demagnetisation knee point coercivity temperature irreversible loss',
    winding_temperature_c:
      'stator winding temperature rise thermal network hot spot lumped parameter',
    gear_bending_stress_mpa:
      'gear tooth root bending stress ISO 6336 Lewis form factor contact stress',
    bearing_l10_life_h:
      'rolling bearing L10 basic rating life ISO 281 dynamic load capacity',
  }
  return extra[duty] ?? words
}

async function main(): Promise<number> {
  const duties = process.argv.slice(2)
  if (!duties.length) {
    console.error('usage: <duty_key> [duty_key ...]')
    return 2
  }
  const { dualSearch } = await import(
    join(ROOT, 'src/lib/pdf-engine-v2/lib/retrieval/dual-search.ts'))

  for (const duty of duties) {
    const q = queryTextFor(duty)
    console.log(`\n=== ${duty}`)
    console.log(`    query: ${q}`)
    // Column names read from the DB schema, not assumed — my first attempt
    // guessed `claim_text`/`title` and every lexical arm failed with
    // "no such column", returning 0 hits that looked like "nothing found".
    for (const [table, lexicalCols, selectCols, embedding] of [
      // fpk_extracted_claims carries a populated `embedding` BLOB (32,118 of
      // 32,453 rows, 6144 bytes = 1536-dim float32), so the VECTOR arm works —
      // it was returning lexical-only purely because I never passed this config.
      ['fpk_extracted_claims',
       ['symbol', 'expression', 'value_text', 'claim_kind'],
       ['unit', 'material_grade', 'component_id', 'product_class'],
       { table: 'fpk_extracted_claims', column: 'embedding',
         format: 'f32le_blob', idColumn: 'id' }],
      // fpk_component_literature has NO embedding column — lexical-only here is
      // a real corpus gap, not a config miss. Embedding it is follow-up work.
      ['fpk_component_literature',
       ['contribution', 'component_id', 'topic_id'],
       ['doi', 'relevance', 'peer_reviewed'], undefined],
    ] as const) {
      try {
        const res = await dualSearch({
          table,
          lexicalCols: [...lexicalCols],
          selectCols: [...selectCols],
          embedding,
          queryText: q,
          k: 3,
          dbPath: DB,
        } as never) as {
          hits: Array<Record<string, unknown>>
          diagnostic: string
          used_embedding: boolean
          lexical_count: number
          semantic_count: number
        }
        console.log(`  [${table}] ${res.hits.length} hits `
          + `(lex ${res.lexical_count} / sem ${res.semantic_count}, `
          + `embedding=${res.used_embedding}) ${res.diagnostic || ''}`)
        for (const hit of res.hits.slice(0, 3)) {
          // dualSearch nests the record under `row`; the top level carries only
          // ranking metadata (lexical_rank / semantic_rank / rrf_score).
          const h = ((hit as Record<string, unknown>).row
            ?? hit) as Record<string, unknown>
          const text = String(
            h.value_text ?? h.contribution ?? h.expression ?? h.symbol ?? ''
          ).replace(/\s+/g, ' ')
          const src = String(h.doi ?? h.component_id ?? h.material_grade ?? '')
          if (!text.trim()) {
            const shown = Object.entries(h)
              .filter(([k, v]) => v !== null && v !== '' && k !== 'embedding')
              .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join('  ')
            console.log(`     • (no value_text) ${shown.slice(0, 200)}`)
          } else console.log(`     • ${text.slice(0, 170)}`)
          if (src) console.log(`       src: ${src.slice(0, 110)}`)
        }
      } catch (e) {
        console.log(`  [${table}] search failed: ${(e as Error).message.slice(0, 140)}`)
      }
    }
  }
  return 0
}

main().then((c) => process.exit(c)).catch((e) => { console.error('FATAL', e); process.exit(1) })
