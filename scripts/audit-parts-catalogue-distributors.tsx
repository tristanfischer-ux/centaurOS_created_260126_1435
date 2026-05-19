/**
 * @file audit-parts-catalogue-distributors.tsx — Task #153 re-audit.
 *
 * For each row in ~/.forgeos/parts-catalogue.db:
 *   1. Call findSkuForPart() against Mouser + Digi-Key + Farnell + LCSC
 *   2. If no distributor returns a match → audit_status = 'unresolved'
 *   3. If a match comes back but price differs by >20% from the stored
 *      distributor_price_gbp → audit_status = 'price_drift', log new price
 *   4. If a match comes back with lifecycle keywords in the availability
 *      string (obsolete / discontinued / EOL / end of life / nrnd) →
 *      audit_status = 'lifecycle_change'
 *   5. Otherwise → audit_status = 'verified'
 *
 * Writes audit_status, audited_at, audit_price_drift_pct, audit_new_price_gbp,
 * audit_lifecycle, audit_notes columns (added via ALTER TABLE).
 *
 * Run: npx tsx scripts/audit-parts-catalogue-distributors.tsx [--limit N] [--dry-run]
 *
 * Constraints honoured:
 *   - Does NOT drop / rename existing columns
 *   - Does NOT mutate manufacturer / part_number / source_method etc.
 *   - Writes ONLY to audit_* columns
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

// Load env files BEFORE importing distributor wrappers (they read keys at module load).
for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
]) {
  try {
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch {}
}

import { getDb, type PartCatalogueRow } from '../src/lib/pdf-engine-v2/parts-catalogue/db'
import { findSkuForPart } from '../src/lib/pdf-engine-v2/lib/distributors'

const PRICE_DRIFT_THRESHOLD = 0.20  // 20%
const LIFECYCLE_KEYWORDS = ['obsolete', 'discontinued', 'end of life', 'end-of-life', 'eol', 'nrnd', 'not recommended', 'no longer available']

interface AuditOutcome {
  manufacturer: string
  part_number: string
  source_method: string
  stored_price_gbp: number | null
  audit_status: 'verified' | 'price_drift' | 'lifecycle_change' | 'unresolved' | 'skipped'
  new_price_gbp: number | null
  drift_pct: number | null
  lifecycle: string | null
  notes: string
  best_source: string | null
}

async function auditOne(row: PartCatalogueRow): Promise<AuditOutcome> {
  const outcome: AuditOutcome = {
    manufacturer: row.manufacturer,
    part_number: row.part_number,
    source_method: row.source_method,
    stored_price_gbp: row.distributor_price_gbp,
    audit_status: 'unresolved',
    new_price_gbp: null,
    drift_pct: null,
    lifecycle: null,
    notes: '',
    best_source: null,
  }

  if (!row.part_number || row.part_number.length < 2) {
    outcome.audit_status = 'skipped'
    outcome.notes = 'part_number empty / too short'
    return outcome
  }

  let result: Awaited<ReturnType<typeof findSkuForPart>> = null
  try {
    result = await findSkuForPart(row.part_number)
  } catch (e) {
    outcome.notes = 'lookup threw: ' + (e as Error).message.slice(0, 120)
    return outcome
  }

  if (!result || !result.best) {
    outcome.notes = 'no distributor match'
    return outcome
  }

  outcome.best_source = result.best.source

  // Manufacturer cross-check — soft. If distributor returns a manufacturer
  // string that shares no tokens with ours, treat the match as suspect.
  const ourMfr = row.manufacturer.toLowerCase().replace(/[^a-z0-9]/g, '')
  const theirMfr = (result.best.manufacturer || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  let mfrMismatch = false
  if (ourMfr.length >= 3 && theirMfr.length >= 3) {
    // Allow substring match either way (handles "TI" vs "Texas Instruments")
    if (!ourMfr.includes(theirMfr) && !theirMfr.includes(ourMfr)) {
      mfrMismatch = true
    }
  }

  // Lifecycle check on availability string
  const availability = String((result.best as any).availability ?? result.best.stockUK ?? '').toLowerCase()
  // mouser/digikey/farnell return a numeric stockUK; lifecycle info is usually
  // encoded in description or a Lifecycle field. We check the description.
  const description = (result.best.description || '').toLowerCase()
  const lifecycleHit = LIFECYCLE_KEYWORDS.find(kw => description.includes(kw) || availability.includes(kw))

  // Manufacturer mismatch is a HARD signal that this is a different product
  // (e.g. Adafruit breakout board matched to Bosch sensor MPN). Treat as
  // unresolved — the stored part can't be re-verified via distributor API.
  if (mfrMismatch) {
    outcome.audit_status = 'unresolved'
    outcome.notes = `distributor match has wrong manufacturer: ours='${row.manufacturer}' theirs='${result.best.manufacturer}' (${result.best.source})`
    outcome.new_price_gbp = result.qty1GBP
    return outcome
  }

  if (lifecycleHit) {
    outcome.audit_status = 'lifecycle_change'
    outcome.lifecycle = lifecycleHit
    outcome.notes = `description suggests lifecycle change ('${lifecycleHit}'); ${result.best.source} desc='${description.slice(0, 80)}'`
    outcome.new_price_gbp = result.qty1GBP
    return outcome
  }

  // Price drift check
  outcome.new_price_gbp = result.qty1GBP
  if (row.distributor_price_gbp !== null && row.distributor_price_gbp > 0 && result.qty1GBP !== null) {
    const drift = (result.qty1GBP - row.distributor_price_gbp) / row.distributor_price_gbp
    outcome.drift_pct = drift
    if (Math.abs(drift) > PRICE_DRIFT_THRESHOLD) {
      outcome.audit_status = 'price_drift'
      outcome.notes = `price drift ${(drift * 100).toFixed(1)}% (stored £${row.distributor_price_gbp.toFixed(2)} → distributor £${result.qty1GBP.toFixed(2)}); source ${result.best.source}`
      return outcome
    }
  }

  outcome.audit_status = 'verified'
  outcome.notes = `verified via ${result.best.source}`
  return outcome
}

;(async () => {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
  const concurrencyIdx = args.indexOf('--concurrency')
  const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 4

  const db = getDb()
  const rows = db.prepare<[], PartCatalogueRow>(`
    SELECT * FROM parts
    ORDER BY verified_at ASC
  `).all()
  const selected = rows.slice(0, limit)

  console.log(`Auditing ${selected.length}/${rows.length} parts via distributor APIs (concurrency=${concurrency}, ${dryRun ? 'DRY-RUN' : 'live'})`)
  console.log(`Keys present: mouser=${!!process.env.MOUSER_API_KEY} digikey=${!!process.env.DIGIKEY_CLIENT_ID} farnell=${!!process.env.FARNELL_API_KEY}`)
  console.log('')

  const updateStmt = db.prepare(`
    UPDATE parts SET
      audit_status = @audit_status,
      audited_at = @audited_at,
      audit_price_drift_pct = @drift_pct,
      audit_new_price_gbp = @new_price_gbp,
      audit_lifecycle = @lifecycle,
      audit_notes = @notes
    WHERE manufacturer_norm = @mfr_norm AND part_number_norm = @pn_norm
  `)

  const outcomes: AuditOutcome[] = []
  let idx = 0
  const counters: Record<string, number> = {
    verified: 0, price_drift: 0, lifecycle_change: 0, unresolved: 0, skipped: 0,
  }

  // Process in parallel batches to amortise per-call latency without
  // hammering rate limits.
  for (let i = 0; i < selected.length; i += concurrency) {
    const batch = selected.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(r => auditOne(r).catch(e => {
      const o: AuditOutcome = {
        manufacturer: r.manufacturer,
        part_number: r.part_number,
        source_method: r.source_method,
        stored_price_gbp: r.distributor_price_gbp,
        audit_status: 'unresolved',
        new_price_gbp: null,
        drift_pct: null,
        lifecycle: null,
        notes: 'error: ' + (e as Error).message.slice(0, 80),
        best_source: null,
      }
      return o
    })))

    for (let j = 0; j < batchResults.length; j++) {
      const r = batch[j]
      const out = batchResults[j]
      outcomes.push(out)
      counters[out.audit_status] = (counters[out.audit_status] ?? 0) + 1
      idx++
      const indicator = out.audit_status === 'verified' ? 'OK '
        : out.audit_status === 'price_drift' ? 'DRIFT'
        : out.audit_status === 'lifecycle_change' ? 'LIFE '
        : out.audit_status === 'unresolved' ? 'NONE'
        : 'SKIP'
      console.log(`[${String(idx).padStart(3)}/${selected.length}] ${indicator} ${out.audit_status.padEnd(16)} ${(r.manufacturer + ' / ' + r.part_number).slice(0, 50).padEnd(50)} ${out.notes.slice(0, 80)}`)
      if (!dryRun) {
        updateStmt.run({
          audit_status: out.audit_status,
          audited_at: new Date().toISOString(),
          drift_pct: out.drift_pct,
          new_price_gbp: out.new_price_gbp,
          lifecycle: out.lifecycle,
          notes: out.notes.slice(0, 500),
          mfr_norm: r.manufacturer_norm,
          pn_norm: r.part_number_norm,
        })
      }
    }
  }

  console.log('\nSummary:')
  for (const [k, v] of Object.entries(counters).sort((a, b) => b[1] - a[1])) {
    const pct = (v / outcomes.length * 100).toFixed(1)
    console.log(`  ${k.padEnd(18)} ${String(v).padStart(4)}  ${pct}%`)
  }

  // Write JSON summary
  const summaryPath = `/tmp/parts-catalogue-audit-outcomes-${new Date().toISOString().split('T')[0]}.json`
  const fs = await import('fs')
  fs.writeFileSync(summaryPath, JSON.stringify({
    audited_at: new Date().toISOString(),
    total_in_db: rows.length,
    audited: outcomes.length,
    counters,
    outcomes,
  }, null, 2))
  console.log(`\nFull outcomes JSON: ${summaryPath}`)
})().catch(e => { console.error(e); process.exit(1) })
