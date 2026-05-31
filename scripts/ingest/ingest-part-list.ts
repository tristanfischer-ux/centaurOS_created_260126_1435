#!/usr/bin/env npx tsx
/**
 * scripts/ingest/ingest-part-list.ts — UNIVERSAL part-list ingest into the
 * distributor verification cache (distributor_cascade_cache).
 *
 * WHY (2026-05-31): the cache covers only ~14% of the parts the emitter uses,
 * so the chain's db-only cascade can't VERIFY 86% of (real) parts — the engine
 * then ships unverified MPNs or strips real ones. This grows the cache from the
 * parts the engine ACTUALLY emits, closing that gap. Universal: works for ANY
 * product class — pass a part list, OR extract the vocabulary from any
 * state.json (so a new class self-heals: emit -> ingest its parts -> verified
 * next run). This is the growing-DB principle applied to part verification.
 *
 * Live distributor APIs are called HERE (ingest side) ONLY — never the chain
 * (chain-as-DB-consumer rule). Native-first (mouser -> digikey -> farnell),
 * Nexar last-resort (protects the 100/mo Evaluation quota). Quota-gated via
 * tryAcquire() so it can never exceed a source's daily cap.
 *
 * Usage (source ~/.claude/secrets/distributor-apis.env first for keys):
 *   npx tsx scripts/ingest/ingest-part-list.ts --from-state /path/state.json[,state2.json]
 *   npx tsx scripts/ingest/ingest-part-list.ts --parts parts.json   # [{manufacturer,mpn}]
 *   flags: --limit=N (default 500), --dry-run (extract+report, no live calls)
 */
import { readFileSync } from 'fs'
import { lookupSkuMouser } from '../../src/lib/pdf-engine-v2/lib/distributors/mouser'
import { lookupSkuDigikey } from '../../src/lib/pdf-engine-v2/lib/distributors/digikey'
import { lookupSkuFarnell } from '../../src/lib/pdf-engine-v2/lib/distributors/farnell'
import { lookupSkuNexar } from '../../src/lib/pdf-engine-v2/lib/distributors/nexar'
import { getCached, setCached } from '../../src/lib/pdf-engine-v2/lib/distributors/cascade-cache'
import { tryAcquire } from '../lib/quota-semaphore'

interface Part { manufacturer: string; mpn: string }

const norm = (k: unknown) => String(k ?? '').toLowerCase().replace(/[\s_-]/g, '')

/** Extract every (manufacturer, mpn) the emitter placed in a state.json. Universal across classes. */
function extractFromState(path: string): Part[] {
  const s = JSON.parse(readFileSync(path, 'utf-8'))
  const mods = s?.moduleDecomposition?.modules ?? s?.modules ?? s?.design?.modules ?? []
  const out: Part[] = []
  for (const m of mods) for (const sm of (m?.sub_modules ?? [])) for (const w of (sm?.words ?? [])) {
    const mc = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
    const mpn = mc.find((x: { kind?: string }) => ['partnumber', 'pn'].includes(norm(x?.kind)))?.value
    const mfr = mc.find((x: { kind?: string }) => norm(x?.kind) === 'manufacturer')?.value
    if (mpn && String(mpn).trim().length >= 3) out.push({ manufacturer: String(mfr ?? ''), mpn: String(mpn).trim() })
  }
  return out
}

const NATIVE: Array<[string, (mpn: string, hint?: string | null) => Promise<{ source: string } | null>]> = [
  ['mouser', lookupSkuMouser as never],
  ['digikey', lookupSkuDigikey as never],
  ['farnell', lookupSkuFarnell as never],
]

async function ingestOne(p: Part, dryRun: boolean): Promise<'hit' | 'miss' | 'cached' | 'quota'> {
  // Skip only on a definitive HIT already cached (don't re-verify verified parts).
  for (const src of ['mouser', 'digikey', 'farnell', 'nexar'] as const) {
    const c = getCached(p.manufacturer, p.mpn, src)
    if (c !== undefined && c !== null) return 'cached'
  }
  if (dryRun) return 'miss'
  const queried: string[] = []
  for (const [src, fn] of NATIVE) {
    if (!tryAcquire(src)) continue            // daily cap reached for this source
    queried.push(src)
    try {
      const r = await fn(p.mpn, p.manufacturer || null)
      if (r) { setCached(p.manufacturer, p.mpn, r.source as never, r as never); return 'hit' }
    } catch { /* try next distributor */ }
  }
  if (tryAcquire('nexar')) {                  // last resort — protects 100/mo quota
    queried.push('nexar')
    try {
      const r = await lookupSkuNexar(p.mpn)
      if (r) { setCached(p.manufacturer, p.mpn, r.source as never, r as never); return 'hit' }
    } catch { /* fall through to miss */ }
  }
  if (queried.length === 0) return 'quota'
  // HITS-ONLY: do NOT record a confirmed-miss. The engine designs INDUSTRIAL
  // products; most of their parts (battery cells, electrolysers, lifting points,
  // structural steel) legitimately are NOT on electronics distributors
  // (Mouser/Digi-Key/Farnell), so "not found here" does NOT mean fictional.
  // Recording miss=1 would make gate-20 falsely fail the chain on real parts
  // (regression hit + reverted 2026-05-31). Leave the part 'absent' (unknown) —
  // this ingest is pure-positive: it only ever ADDS verified parts, never condemns.
  return 'miss'
}

async function main() {
  const argv = process.argv
  const flag = (f: string) => {
    const eq = argv.find((a) => a.startsWith(`${f}=`))
    if (eq) return eq.slice(f.length + 1)
    const i = argv.indexOf(f)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
  }
  const dryRun = argv.includes('--dry-run')
  const limit = Number(flag('--limit') ?? 500)
  let parts: Part[] = []
  const pf = flag('--parts'); const sf = flag('--from-state')
  if (pf) parts = JSON.parse(readFileSync(pf, 'utf-8'))
  else if (sf) for (const p of sf.split(',')) parts.push(...extractFromState(p.trim()))
  else { console.error('usage: --from-state <state.json[,...]> | --parts <file.json> [--limit=N] [--dry-run]'); process.exit(1) }

  const seen = new Set<string>(); const uniq: Part[] = []
  for (const p of parts) { const k = `${p.manufacturer || ''}|${p.mpn}`; if (!seen.has(k)) { seen.add(k); uniq.push(p) } }
  const todo = uniq.slice(0, limit)
  console.log(`[ingest-part-list] ${uniq.length} unique parts (${dryRun ? 'DRY-RUN — ' : ''}processing ${todo.length})`)

  const tally = { hit: 0, miss: 0, cached: 0, quota: 0 }
  let i = 0
  for (const p of todo) {
    const r = await ingestOne(p, dryRun)
    tally[r]++; i++
    if (r === 'hit' || i % 25 === 0) console.log(`  [${i}/${todo.length}] ${r.toUpperCase().padEnd(6)} ${(p.manufacturer || '?').slice(0, 22).padEnd(22)} ${p.mpn}`)
    if (r === 'quota') break  // all sources capped — stop, resume tomorrow
  }
  console.log(`[ingest-part-list] DONE — newly-verified(hit)=${tally.hit} confirmed-miss=${tally.miss} already-cached=${tally.cached} quota-skipped=${tally.quota}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
