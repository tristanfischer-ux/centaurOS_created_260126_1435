/**
 * scripts/ingest/refresh-material-prices.ts
 *
 * The "grows over time" half of the materials GROWING-DB (UNIVERSAL-ENGINE-PLAN.md
 * Lever 5). Walks `material_prices` in forge-truth.db, and for each row STALER
 * than REFRESH_AFTER_DAYS, fetches a live commodity price and writes it back with
 * origin='web' + today's date. DB-first → web-on-stale → write-back → grow.
 * INGEST-side (read-write) per CHAIN-AS-DB-CONSUMER; cron-able alongside the
 * weekly component sweep.
 *
 * LIVE SOURCE (pluggable): the plumbing here is complete + tested; the live fetch
 * is intentionally a documented hook so this can run safely with no source wired
 * (it no-ops, keeping the curated seed value — the deterministic fallback). To
 * enable live refresh, set TRADING_ECONOMICS_KEY (free tier covers steel / copper
 * / aluminium / iron-ore) in ~/.claude/secrets/*.env or .env.local and implement
 * fetchLivePriceGbpPerKg(). USD→GBP + futures→spot normalisation belong there.
 * Non-traded materials (concrete, timber, GFRP, wind_blade) have no public spot
 * feed — they stay curated until manually re-dated.
 *
 * Usage: npx tsx scripts/ingest/refresh-material-prices.ts [--dry] [--days=N] [--force]
 */
import Database from 'better-sqlite3'
import { homedir } from 'os'
import { resolve } from 'path'
import { existsSync } from 'fs'

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')
const daysArg = process.argv.find(a => a.startsWith('--days='))
const REFRESH_AFTER_DAYS = daysArg ? Number(daysArg.split('=')[1]) : 30

interface MaterialRow {
  material: string
  raw_gbp_per_kg: number
  updated: string
  origin: string
}

/**
 * Fetch the live RAW commodity price (£/kg) for a material, or null when there
 * is no live source (keep the curated value). PLUGGABLE — see header. Must
 * return a RAW commodity £/kg (the mfg multiplier band stays as curated).
 */
async function fetchLivePriceGbpPerKg(_material: string): Promise<number | null> {
  // No live source wired yet (deliberate — keeps autonomous/cron runs safe).
  // When TRADING_ECONOMICS_KEY (or another feed) is configured, implement the
  // fetch + USD→GBP + futures→spot normalisation here and return £/kg, else null.
  return null
}

function daysBetween(isoA: string, isoB: string): number {
  const a = Date.parse(isoA), b = Date.parse(isoB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  return Math.abs(b - a) / 86_400_000
}

async function main(): Promise<void> {
  if (!existsSync(DB_PATH)) {
    console.error(`[refresh-materials] forge-truth.db not found at ${DB_PATH}`)
    process.exit(1)
  }
  const db = new Database(DB_PATH)
  // The chain may not have seeded yet; refresh is a no-op then.
  let rows: MaterialRow[] = []
  try {
    rows = db.prepare('SELECT material, raw_gbp_per_kg, updated, origin FROM material_prices').all() as MaterialRow[]
  } catch {
    console.error('[refresh-materials] material_prices table missing — run seed-material-prices.ts first')
    db.close()
    process.exit(1)
  }
  // Today's date as YYYY-MM-DD without Date.now() drift sensitivity in logs:
  // we only need a stamp for write-back; read it from the OS once.
  const today = new Date().toISOString().slice(0, 10)
  const update = db.prepare(
    `UPDATE material_prices SET raw_gbp_per_kg=@raw, updated=@updated, origin='web', source=@source WHERE material=@material`,
  )

  let checked = 0, refreshed = 0, skippedFresh = 0, noSource = 0
  for (const r of rows) {
    checked++
    const stale = FORCE || daysBetween(r.updated, today) >= REFRESH_AFTER_DAYS
    if (!stale) { skippedFresh++; continue }
    const live = await fetchLivePriceGbpPerKg(r.material)
    if (live == null || !(live > 0)) { noSource++; continue }
    if (!DRY) {
      update.run({ material: r.material, raw: live, updated: today, source: `live feed ${today}` })
    }
    refreshed++
    console.log(`[refresh-materials] ${r.material}: £${r.raw_gbp_per_kg}/kg → £${live}/kg (live)`)
  }
  console.log(
    `[refresh-materials] checked=${checked} refreshed=${refreshed} fresh=${skippedFresh} no-live-source=${noSource}` +
    `${DRY ? ' (dry)' : ''}. Stale threshold ${REFRESH_AFTER_DAYS}d. Non-refreshed rows keep their curated value (deterministic fallback).`,
  )
  db.close()
}

main().catch((e) => { console.error('[refresh-materials] fatal:', e); process.exit(1) })
