/**
 * scripts/probe-fill.ts — OFFLINE retrieval probe: would the fill pin THIS word, and why not?
 *
 * Born 2026-07-10 (Powerwall runs 44-53): the same diagnosis was re-done ad-hoc four times —
 * 'DC Fuses' had a PERFECT seeded row (priority lane, design-vocab name) yet stayed TBD for
 * ~10 runs across FOUR stacked retrieval layers (provenance lane → vocabulary → tokenize
 * dropping 'dc' → head noun beyond the lead segment), each found by hand-writing this exact
 * probe. A chain run takes ~40 min and £; this answers the same question in seconds.
 *
 *   npx tsx scripts/probe-fill.ts "Main DC Contactor" [sub_module_id] [more words...]
 *
 * Prints the ranked DB hit, the acceptance verdict, and — on a miss — WHICH layer refused
 * (no window rows / rank bar / type-coherence), so the fix targets the right layer.
 */
import Database from 'better-sqlite3'
import os from 'os'
import { dbFirstLookup, dbHitAcceptableForWord, tokenize, partNameLeadSegment, headNounHit } from '../src/lib/pdf-engine-v2/lib/emitter-completion'

const args = process.argv.slice(2)
if (!args.length) { console.log('usage: npx tsx scripts/probe-fill.ts "<word name>" [sub_module_id] ...'); process.exit(2) }
const db = new Database(`${os.homedir()}/.forge-truth/forge-truth.db`, { readonly: true })

for (const name of args) {
  const toks = [...new Set([...tokenize(name)])]
  const head = tokenize(name).slice(-1)[0] ?? null
  const hit = dbFirstLookup(db, toks, head, { excludeMakerVendors: true })
  if (!hit) {
    // layer diagnosis: does ANY row exist for the head noun at all?
    const rows = head ? db.prepare(
      `SELECT part_name FROM pretraining_extracted_parts WHERE LOWER(part_name) LIKE '%' || ? || '%' LIMIT 3`,
    ).all(head) as Array<{ part_name: string }> : []
    console.log(`✗ ${name}\n    tokens [${toks.join(', ')}] head '${head}' → NO hit passed the rank bar`)
    if (!rows.length) console.log(`    layer: NO DB row contains '${head}' at all — seed this family`)
    else console.log(`    layer: rows exist (e.g. '${String(rows[0].part_name).slice(0, 60)}') — rank bar / lead-segment / vocabulary mismatch; compare tokens vs the row's first-6-token lead`)
    continue
  }
  const ok = dbHitAcceptableForWord(hit, name)
  const lead = partNameLeadSegment(hit.part_name)
  console.log(`${ok ? '✓' : '✗'} ${name}\n    → ${hit.manufacturer} ${hit.part_number} | ${String(hit.part_name).slice(0, 70)}\n    acceptable=${ok} headInLead=${head ? headNounHit(lead, head) : '—'} (lead: '${lead}')`)
}
db.close()
