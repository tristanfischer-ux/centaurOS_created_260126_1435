/**
 * @file audit-parts-catalogue.tsx — Audit every row in ~/.forgeos/parts-catalogue.db
 * via the stealth browser. Mark stale any row whose URL does not resolve to
 * a real product page that references the expected manufacturer or part_number.
 *
 * Run: npx tsx scripts/audit-parts-catalogue.tsx [--dry-run] [--limit N] [--filter <source>]
 *
 * Background: the catalogue accumulates verified parts so re-runs hit cache
 * (Phase 0 of the cascade). The stealth Chromium browser bypasses Cloudflare /
 * Akamai WAFs that defeat naive HEAD checks — so we can validate distributor
 * URLs without false negatives.
 *
 * Known prior issues (smoke-test seeds before stealth existed):
 *   - Texas Instruments BQ79616 (mouser) — Mouser URL redirects to homepage
 *   - STMicroelectronics STM32F427VGT6 (farnell) — Farnell URL is dead
 */

import { getDb, markStale, totalCount, type PartCatalogueRow } from '../src/lib/pdf-engine-v2/parts-catalogue/db'
import { verifyUrlsStealth, type UrlVerifyResult } from './url-verify-stealth'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

interface AuditRow {
  manufacturer: string
  part_number: string
  source_method: string
  source_url: string
  verdict: UrlVerifyResult['verdict']
  status_code: number | null
  expected_terms_found: string[]
  page_title: string | null
  invalidated: boolean
  ms_elapsed: number
  error?: string
}

const OK_VERDICTS = new Set<UrlVerifyResult['verdict']>(['real_product_page', 'waf_resolved'])

;(async () => {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const filterIdx = args.indexOf('--filter')
  const limit = limitIdx > 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
  const filterMethod = filterIdx > 0 ? args[filterIdx + 1] : null

  const db = getDb()
  const total = totalCount(db)
  console.log(`Parts catalogue at ~/.forgeos/parts-catalogue.db — ${total} rows total`)

  // Pull every row with a non-null URL. Order by verified_at DESC so the
  // newest entries get audited first (oldest seeds = smoke-test bugs).
  const rows = db.prepare<[], PartCatalogueRow>(`
    SELECT * FROM parts
    WHERE source_url IS NOT NULL AND source_url != ''
    ORDER BY verified_at DESC
  `).all()

  const filtered = filterMethod ? rows.filter(r => r.source_method === filterMethod) : rows
  const selected = filtered.slice(0, limit)

  console.log(`Auditing ${selected.length} URLs${filterMethod ? ` (filter: ${filterMethod})` : ''}${dryRun ? ' (DRY RUN — no DB writes)' : ''}`)
  console.log(`Estimated time: ${Math.ceil(selected.length * 20 / 60)} min @ ~20s/URL`)
  console.log('')

  const inputs = selected.map(r => ({
    url: r.source_url!,
    expectedTerms: [r.manufacturer, r.part_number].filter(Boolean) as string[],
  }))

  // Stealth verifier loops serially with one browser instance.
  const screenshotDir = resolve(homedir(), '.forgeos', 'audit-screenshots', new Date().toISOString().split('T')[0])
  const results = await verifyUrlsStealth(inputs, { screenshotDir })

  // Reconcile rows ↔ results and decide invalidations.
  const auditRows: AuditRow[] = []
  let invalidated = 0
  console.log('VERDICT              METHOD     MFR / PART                              STATUS  TITLE/SNIPPET')
  console.log('-'.repeat(170))
  for (let i = 0; i < results.length; i++) {
    const row = selected[i]
    const r = results[i]
    const ok = OK_VERDICTS.has(r.verdict)
    const marker = ok ? 'OK ' : 'BAD'
    const title = (r.page_title ?? r.body_snippet ?? r.error ?? '').replace(/\s+/g, ' ').slice(0, 60)
    const summary = `${marker} ${r.verdict.padEnd(20)} ${row.source_method.padEnd(10)} ${(row.manufacturer + ' / ' + row.part_number).slice(0, 38).padEnd(38)} ${String(r.status_code ?? '-').padEnd(5)} ${title}`
    console.log(summary)

    let didInvalidate = false
    if (!ok) {
      if (!dryRun) {
        markStale(row.manufacturer, row.part_number, db)
      }
      invalidated++
      didInvalidate = true
    }
    auditRows.push({
      manufacturer: row.manufacturer,
      part_number: row.part_number,
      source_method: row.source_method,
      source_url: row.source_url!,
      verdict: r.verdict,
      status_code: r.status_code,
      expected_terms_found: r.expected_terms_found,
      page_title: r.page_title,
      invalidated: didInvalidate,
      ms_elapsed: r.ms_elapsed,
      error: r.error,
    })
  }

  // Per-method summary
  console.log('\nPer-method:')
  const breakdown: Record<string, Record<string, number>> = {}
  for (const a of auditRows) {
    breakdown[a.source_method] ??= {}
    breakdown[a.source_method][a.verdict] = (breakdown[a.source_method][a.verdict] ?? 0) + 1
  }
  for (const [m, verdicts] of Object.entries(breakdown).sort()) {
    const tot = Object.values(verdicts).reduce((a, b) => a + b, 0)
    const okN = (verdicts.real_product_page ?? 0) + (verdicts.waf_resolved ?? 0)
    console.log(`  ${m.padEnd(12)} ${okN}/${tot} OK   ${JSON.stringify(verdicts)}`)
  }

  console.log(`\nOVERALL: ${auditRows.length - invalidated}/${auditRows.length} OK   ${invalidated} invalidated${dryRun ? ' (dry-run, no writes)' : ''}`)

  // Save report
  const reportDir = resolve(homedir(), '.forgeos', 'audits')
  mkdirSync(reportDir, { recursive: true })
  const reportPath = resolve(reportDir, `parts-catalogue-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(reportPath, JSON.stringify({
    audited_at: new Date().toISOString(),
    total_rows_in_db: total,
    audited: auditRows.length,
    ok: auditRows.length - invalidated,
    invalidated,
    dry_run: dryRun,
    filter_method: filterMethod,
    rows: auditRows,
    per_method: breakdown,
  }, null, 2))
  console.log(`\nReport: ${reportPath}`)
  console.log(`Screenshots: ${screenshotDir}`)
})().catch(e => { console.error(e); process.exit(1) })
