// Standalone self-audit runner (2026-06-06): runs the SAME runSemanticSelfAudit
// the chain uses, against an existing state.json, using the CURRENT _buildComplianceRows
// (so it reflects renderer-side compliance fixes WITHOUT a full chain re-run).
// Usage: npx tsx scripts/run-self-audit-standalone.tsx <state.json>
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runSemanticSelfAudit, buildAuditDigest } from './lib/semantic-self-audit'

// Load .env.local (OPENROUTER_API_KEY) — tsx does not auto-load it.
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* env optional */ }

const statePath = process.argv[2]
if (!statePath) { console.error('usage: run-self-audit-standalone.tsx <state.json>'); process.exit(2) }
const state = JSON.parse(readFileSync(statePath, 'utf-8'))
const productClass = String(
  state?.keyMetrics?.product_class ?? state?.parsedBrief?.constraints?.product_class
  ?? state?.complianceGate?.product_class ?? 'unknown',
).trim().toLowerCase()

const callLlm = async (o: { model: string; system: string; user: string; maxTokens?: number; temperature?: number }) => {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: o.model,
      messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }],
      temperature: o.temperature ?? 0.1,
      max_tokens: o.maxTokens ?? 4000,
    }),
  })
  const j: any = await res.json()
  return { text: j?.choices?.[0]?.message?.content ?? '', latency_ms: 0 }
}

;(async () => {
  // Deterministic digest first (no LLM) — shows the compliance counts the judge sees.
  const digest = buildAuditDigest(state, productClass)
  const compSec = digest.sections.find(s => s.name === 'brief_compliance')
  console.log('=== DETERMINISTIC compliance digest (what the judge reads) ===')
  console.log(compSec?.text?.split('\n').slice(0, 6).join('\n') ?? '(none)')
  console.log('\n=== LLM judge (grok-4.3) ===')
  const sa = await runSemanticSelfAudit(state, { productClass, callLlm, mode: 'shadow' })
  if (!sa.ok) { console.log('JUDGE FAILED:', sa.error); process.exit(0) }
  console.log(`floor=${sa.min_score} mean=${sa.mean_score}`)
  for (const s of (sa.sections ?? []).slice().sort((a: any, b: any) => a.score - b.score)) {
    const flag = s.score < 8 ? '  <<< BELOW 8' : ''
    console.log(`  ${s.score}  ${s.name}${flag}`)
    if (s.score < 8 && s.defects?.length) for (const d of s.defects) console.log(`        - ${d}`)
  }
})()
