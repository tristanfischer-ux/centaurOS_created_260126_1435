/**
 * Smoke test for lib/local-corpus.ts. Uses a real OpenAI embedding call to
 * verify the semantic search surfaces plausible UK/EU suppliers for a query.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/test-local-corpus.ts
 */

// Load env from project .env.local
import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
} catch { /* ignore */ }

import {
  semanticSupplierSearch,
  isLocalCorpusAvailable,
  getCorpusStats,
} from '../src/lib/pdf-engine-v2/lib/local-corpus'

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data[0].embedding
}

async function main() {
  console.log('=== local-corpus smoke test ===')
  console.log('Available:', isLocalCorpusAvailable())
  console.log('Stats:', getCorpusStats())
  console.log()

  const queries = [
    'CATL 280 Ah LFP prismatic lithium cell supplier UK',
    '30 kW R290 scroll compressor for air-to-water heat pump',
    'horticultural LED grow light 200 umol/m2/s tunable spectrum indoor farming',
    'CNC turning aluminium 6061 precision machined part UK supplier',
    'electronic manufacturing services PCB assembly UK ISO 9001',
  ]

  for (const q of queries) {
    console.log(`--- "${q}" ---`)
    const t0 = Date.now()
    const emb = await embedQuery(q)
    const results = semanticSupplierSearch(emb, 5, 0.3)
    const dt = Date.now() - t0
    if (!results) {
      console.log('  (no local corpus available)')
      continue
    }
    console.log(`  ${results.length} hits, ${dt}ms`)
    for (const r of results) {
      const caps = r.processCapabilities.slice(0, 2).map(p => p.processName).join(', ')
      console.log(
        `  [${r.similarity.toFixed(3)}] ${r.name} (${r.country ?? '?'})` +
        (caps ? `  ${caps}` : '') +
        (r.certifications.length > 0 ? `  certs: ${r.certifications.slice(0, 2).join(', ')}` : ''),
      )
    }
    console.log()
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error('FAIL:', e)
  process.exit(1)
})
