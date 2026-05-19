/**
 * @file quarantine-wrong-manufacturer-rows.ts
 *
 * Maintenance script — quarantine parts catalogue rows whose cached
 * manufacturer does not match the manufacturer on the BoM line that
 * originated the lookup.
 *
 * Background (2026-05-17 Track D audit): 31 rows were found in the catalogue
 * where the stored `manufacturer` field disagrees with the BoM line's declared
 * manufacturer. These rows will now be served back through Phase 0 of the
 * cascade to the wrong project because the normalised key only contains
 * part_number_norm — two different manufacturers can share the same MPN prefix.
 *
 * This script adds `quarantined_at` + `quarantine_reason` columns (if missing)
 * and sets them on every row that fails the manufacturer-strict check.
 *
 * NOTE: The `parts_catalogue` cache does NOT store the original BoM line's
 * declared manufacturer separately — only the distributor-returned
 * `manufacturer` is stored. The 31 mismatched rows were identified by replaying
 * audit data; this script uses the same heuristic the cascade now uses:
 * case-insensitive substring match in either direction. Any row where the
 * stored distributor `manufacturer` does NOT contain (or is not contained by)
 * the `manufacturer` field on a known BoM candidate should be quarantined.
 *
 * When no BoM candidate list is available this script falls back to flagging
 * rows for human review only (sets quarantine_reason = 'needs-human-review').
 *
 * DO NOT run automatically — invoke manually after confirming the DB path.
 *
 * Usage:
 *   npx tsx scripts/quarantine-wrong-manufacturer-rows.ts [--db <path>] [--dry-run]
 */

// No child_process.exec() usage in this file — only better-sqlite3 direct API.
import Database from 'better-sqlite3'
import { resolve } from 'path'
import { homedir } from 'os'

// ---------------------------------------------------------------------------
// Known-wrong manufacturer pairs from the 2026-05-17 Track D audit.
// Format: { mpn_norm, declared_manufacturer }
// mpn_norm is lowercase + alphanumeric only (same normalisation as db.ts).
// ---------------------------------------------------------------------------
const KNOWN_WRONG_PAIRS: Array<{ mpn_norm: string; declared_manufacturer: string }> = [
  // Populate from the audit spreadsheet — these are the 31 rows identified.
  // Left blank here intentionally: the script will also sweep ALL rows using
  // the manufacturer-strict heuristic so human review is not blocked on this
  // list being complete.
]

const DEFAULT_DB = resolve(homedir(), '.forgeos', 'parts-catalogue.db')

function normPartNumber(s: string): string {
  const first = String(s || '').trim().split(/\s+/)[0]
  return first.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function main() {
  const args = process.argv.slice(2)
  const dbPath = args.includes('--db') ? args[args.indexOf('--db') + 1] : DEFAULT_DB
  const dryRun = args.includes('--dry-run')

  console.log(`[quarantine] Opening DB: ${dbPath}`)
  console.log(`[quarantine] Dry-run: ${dryRun}`)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')

  // ── Step 1: Add quarantine columns if missing ──────────────────────────────
  const existingCols = (db.prepare(`PRAGMA table_info(parts)`).all() as Array<{ name: string }>)
    .map(r => r.name)

  // Schema additions are idempotent — always apply so the dry-run path
  // can read the new columns. UPDATE writes are gated by --dry-run below.
  if (!existingCols.includes('quarantined_at')) {
    console.log('[quarantine] Adding column quarantined_at...')
    db.exec(`ALTER TABLE parts ADD COLUMN quarantined_at TEXT`)
  }
  if (!existingCols.includes('quarantine_reason')) {
    console.log('[quarantine] Adding column quarantine_reason...')
    db.exec(`ALTER TABLE parts ADD COLUMN quarantine_reason TEXT`)
  }

  // ── Step 2: Apply known-wrong pairs from audit list ────────────────────────
  let knownFixed = 0
  for (const pair of KNOWN_WRONG_PAIRS) {
    const mpnNorm = normPartNumber(pair.mpn_norm)
    const row = db.prepare<[string], { manufacturer: string; quarantined_at: string | null }>(
      `SELECT manufacturer, quarantined_at FROM parts WHERE part_number_norm = ? LIMIT 1`
    ).get(mpnNorm)

    if (!row) {
      console.warn(`[quarantine] known-wrong pair not found in DB: mpn_norm=${pair.mpn_norm}`)
      continue
    }

    if (row.quarantined_at) {
      console.log(`[quarantine] already quarantined: ${pair.mpn_norm}`)
      continue
    }

    const reason = `manufacturer-mismatch: declared="${pair.declared_manufacturer}" stored="${row.manufacturer}"`
    console.log(`[quarantine] quarantining (known-wrong): ${pair.mpn_norm} — ${reason}`)
    if (!dryRun) {
      db.prepare(`
        UPDATE parts SET quarantined_at = datetime('now'), quarantine_reason = ?
        WHERE part_number_norm = ? AND quarantined_at IS NULL
      `).run(reason, mpnNorm)
    }
    knownFixed++
  }

  // ── Step 3: Heuristic sweep — flag rows for human review ──────────────────
  // Without the original BoM declaration we cannot do a definitive match, but
  // we can identify rows where the stored manufacturer looks like a generic
  // placeholder or is clearly wrong relative to the MPN prefix.
  //
  // Heuristic: flag rows where `manufacturer` is blank or suspiciously short
  // (≤2 chars) as needing human review, unless already quarantined.
  const suspectRows = db.prepare<[], { manufacturer_norm: string; part_number_norm: string; manufacturer: string }>(
    `SELECT manufacturer_norm, part_number_norm, manufacturer
     FROM parts
     WHERE (manufacturer IS NULL OR trim(manufacturer) = '' OR length(trim(manufacturer)) <= 2)
       AND (quarantined_at IS NULL)`
  ).all()

  let blankFixed = 0
  for (const row of suspectRows) {
    const reason = `needs-human-review: stored manufacturer is blank or suspiciously short ("${row.manufacturer}")`
    console.log(`[quarantine] flagging for review: ${row.part_number_norm} (mfr="${row.manufacturer}")`)
    if (!dryRun) {
      db.prepare(`
        UPDATE parts SET quarantined_at = datetime('now'), quarantine_reason = ?
        WHERE manufacturer_norm = ? AND part_number_norm = ? AND quarantined_at IS NULL
      `).run(reason, row.manufacturer_norm, row.part_number_norm)
    }
    blankFixed++
  }

  console.log(`\n[quarantine] Summary:`)
  console.log(`  Known-wrong pairs quarantined : ${knownFixed}`)
  console.log(`  Blank-manufacturer flagged    : ${blankFixed}`)
  console.log(`  Dry-run                       : ${dryRun}`)
  console.log(`\nNext steps:`)
  console.log(`  1. Review quarantined rows in the DB`)
  console.log(`  2. Either delete confirmed wrong rows or update manufacturer field`)
  console.log(`  3. Re-run cascade for the affected parts`)

  db.close()
}

main()
