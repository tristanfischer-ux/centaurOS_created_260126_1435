#!/usr/bin/env -S npx tsx
/**
 * demo-dual-search.tsx — LIVE proof that hybrid (lexical + semantic) retrieval
 * beats either retriever alone, on the real supplier DB.
 *
 * Runs three queries via the shared dualSearch() helper over `companies` JOIN
 * `supplier_embeddings` (cleantech-uk profile, GB), printing per-hit
 * lexical_rank | semantic_rank | rrf_score so you can SEE which arm saved each
 * row. Read-only; needs OPENAI_API_KEY for the semantic arm.
 *
 *   npx tsx scripts/demo-dual-search.tsx
 */
import { existsSync, readFileSync } from 'fs'
import { dualSearch, type DualSearchHit } from '../src/lib/pdf-engine-v2/lib/retrieval/dual-search'

// Load OPENAI key from env or the usual secrets files (mirror the chain).
if (!process.env.OPENAI_API_KEY) {
  for (const f of [
    '/Users/tristanfischer/.claude/secrets/openai.env',
    '/Users/tristanfischer/.claude/secrets/openrouter.env',
    '/Users/tristanfischer/Developer/Forge-Capital/.env',
  ]) {
    if (existsSync(f)) {
      const m = readFileSync(f, 'utf-8').match(/OPENAI_API_KEY=([^\s]+)/)
      if (m) { process.env.OPENAI_API_KEY = m[1]; break }
    }
  }
}

const DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const WHERE = "search_profile_id = 'cleantech-uk' AND country = 'GB' AND ch_company_number IS NOT NULL AND ch_company_number != ''"

interface DemoRow { id: string; name: string; description: string | null }

function fmt(hits: DualSearchHit<DemoRow>[]): void {
  console.log('  rank │ lex │ sem │  rrf   │ company')
  console.log('  ─────┼─────┼─────┼────────┼────────────────────────────────────')
  hits.forEach((h, i) => {
    const lex = h.lexical_rank === null ? ' — ' : String(h.lexical_rank).padStart(3)
    const sem = h.semantic_rank === null ? ' — ' : String(h.semantic_rank).padStart(3)
    const rrf = h.rrf_score.toFixed(4)
    const nm = (h.row?.name ?? '(?)').slice(0, 40)
    console.log(`  ${String(i).padStart(4)} │ ${lex} │ ${sem} │ ${rrf} │ ${nm}`)
  })
}

async function run(label: string, queryText: string, k = 10) {
  console.log(`\n━━━ ${label} ━━━`)
  console.log(`query: "${queryText}"`)
  const res = await dualSearch<DemoRow>({
    table: 'companies',
    idColumn: 'id',
    lexicalCols: ['name', 'description', 'specialties'],
    selectCols: ['description'],
    embedding: { table: 'supplier_embeddings', column: 'embedding', format: 'json_text', joinColumn: 'company_id' },
    queryText,
    k,
    where: WHERE,
    dbPath: DB,
  })
  console.log(res.diagnostic)
  fmt(res.hits)
  return res
}

/** A "save" = the row is in the fused top-k, but ONE arm ranked it far worse
 *  than the other (or missed it entirely). delta>=8 ranks is a strong save. */
function saves(hits: DualSearchHit<DemoRow>[], dir: 'semantic' | 'lexical', minDelta = 8) {
  return hits.filter((h) => {
    const lex = h.lexical_rank, sem = h.semantic_rank
    if (dir === 'semantic') {
      // semantic ranked it well, lexical missed it or ranked it much worse.
      if (sem === null) return false
      return lex === null || lex - sem >= minDelta
    } else {
      if (lex === null) return false
      return sem === null || sem - lex >= minDelta
    }
  })
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not found — semantic arm cannot run; aborting demo.')
    process.exit(1)
  }

  // CASE 1 — SEMANTIC SAVES IT (capability synonym the LIKE under-ranks).
  // Need text uses "stationary energy storage / containerised power" wording;
  // firms that describe themselves with adjacent vocabulary ("energy storage
  // system", "power store") share few literal tokens, so the keyword arm ranks
  // them low while cosine pulls them up.
  const c1 = await run(
    'CASE 1 — semantic saves it (capability synonym)',
    'turnkey grid-scale stationary energy storage integration and commissioning for utilities',
  )
  const semSaves = saves(c1.hits, 'semantic', 8)
  console.log(`  → ${semSaves.length} fused row(s) the SEMANTIC arm rescued (lexical ranked them ≥8 worse / missed):`)
  for (const h of semSaves.slice(0, 5)) {
    console.log(`      • ${h.row?.name}  [lex ${h.lexical_rank ?? '—'} → sem ${h.semantic_rank}]  "${(h.row?.description ?? '').replace(/\s+/g, ' ').slice(0, 70)}"`)
  }

  // CASE 2 — LEXICAL SAVES IT (exact company name the embedding buries).
  // Query the distinctive NAME alone. "Kraken" (Zenobē's GB battery operator,
  // ch 14701136) has a capability-heavy embedding, so a bare-name query ranks it
  // low semantically — but the LIKE arm hits the exact name token at the top.
  const c2 = await run('CASE 2 — lexical saves it (exact company name)', 'Kraken')
  const kr = c2.hits.find((h) => (h.row?.name ?? '').toLowerCase() === 'kraken')
  if (kr) {
    const pos = c2.hits.indexOf(kr)
    console.log(`  → "Kraken" fused at position ${pos}: lexical_rank=${kr.lexical_rank}, semantic_rank=${kr.semantic_rank ?? 'absent from semantic top-list'}`)
    const lexFloated = kr.lexical_rank !== null && (kr.semantic_rank === null || kr.lexical_rank < kr.semantic_rank)
    console.log(`     ${lexFloated ? 'LEXICAL floated it — the embedding alone would have buried it.' : '(embedding also ranked it well here)'}`)
  } else {
    console.log('  → (Kraken not surfaced — see fused list above)')
  }
  const lexSaves2 = saves(c2.hits, 'lexical', 8)
  console.log(`  → ${lexSaves2.length} fused row(s) the LEXICAL arm rescued (semantic ranked them ≥8 worse / missed):`)
  for (const h of lexSaves2.slice(0, 5)) {
    console.log(`      • ${h.row?.name}  [sem ${h.semantic_rank ?? '—'} → lex ${h.lexical_rank}]`)
  }

  console.log('\n━━━ VERDICT (hybrid > either alone) ━━━')
  console.log(`  • CASE 1 semantic-rescued rows (lexical-only would have dropped): ${semSaves.length}`)
  console.log(`  • CASE 2 lexical-rescued rows (semantic-only would have dropped): ${lexSaves2.length}`)
  console.log(`  • "Kraken" exact-name save: ${kr ? (kr.lexical_rank !== null && (kr.semantic_rank === null || kr.lexical_rank < kr.semantic_rank) ? 'YES' : 'no') : 'n/a'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
