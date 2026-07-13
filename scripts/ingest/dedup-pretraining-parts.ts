/**
 * scripts/ingest/dedup-pretraining-parts.ts — collapse duplicate rows in
 * pretraining_extracted_parts on (manufacturer, part_number).
 *
 * seed-verified-class-parts.ts was writing duplicate rows per MPN (5–6× each),
 * polluting dbFirstLookup ranking. Keeps the BEST row per key:
 *   web_verified_ingest (conf ≥ 0.9) > higher confidence > newest id.
 *
 *   npx tsx scripts/ingest/dedup-pretraining-parts.ts [--dry-run]
 */
import { homedir } from 'os'
import { resolve } from 'path'
import Database from 'better-sqlite3'

const dryRun = process.argv.includes('--dry-run')
const dbPath = resolve(homedir(), '.forge-truth', 'forge-truth.db')

function rowScore(r: {
  discovery_source: string | null
  confidence: number | null
  id: number
}): number[] {
  const verified =
    (r.discovery_source ?? '') === 'web_verified_ingest' && (r.confidence ?? 0) >= 0.9 ? 1 : 0
  return [verified, r.confidence ?? 0, r.id]
}

function main(): void {
  const db = new Database(dbPath)
  db.pragma('busy_timeout = 5000')

  const dupGroups = db.prepare(`
    SELECT LOWER(TRIM(manufacturer)) AS mfr, LOWER(TRIM(part_number)) AS mpn, COUNT(*) AS n
    FROM pretraining_extracted_parts
    WHERE manufacturer IS NOT NULL AND TRIM(manufacturer) != ''
      AND part_number IS NOT NULL AND LENGTH(TRIM(part_number)) >= 4
    GROUP BY mfr, mpn
    HAVING n > 1
  `).all() as Array<{ mfr: string; mpn: string; n: number }>

  console.log(`[dedup] ${dupGroups.length} duplicate (manufacturer, mpn) group(s)`)
  if (dupGroups.length === 0) {
    db.close()
    return
  }

  const selectRows = db.prepare(`
    SELECT id, discovery_source, confidence
    FROM pretraining_extracted_parts
    WHERE LOWER(TRIM(manufacturer)) = ? AND LOWER(TRIM(part_number)) = ?
    ORDER BY id
  `)
  const del = db.prepare(`DELETE FROM pretraining_extracted_parts WHERE id = ?`)

  let deleted = 0
  const tx = db.transaction(() => {
    for (const g of dupGroups) {
      const rows = selectRows.all(g.mfr, g.mpn) as Array<{
        id: number
        discovery_source: string | null
        confidence: number | null
      }>
      let best = rows[0]!
      for (const r of rows.slice(1)) {
        const a = rowScore(r)
        const b = rowScore(best)
        let pick = best
        for (let i = 0; i < a.length; i++) {
          if (a[i]! > b[i]!) { pick = r; break }
          if (a[i]! < b[i]!) break
        }
        best = pick
      }
      for (const r of rows) {
        if (r.id === best.id) continue
        if (!dryRun) del.run(r.id)
        deleted++
      }
    }
  })
  tx()
  console.log(`[dedup] ${dryRun ? 'would delete' : 'deleted'} ${deleted} duplicate row(s)`)
  db.close()
}

main()
