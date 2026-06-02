/**
 * CLI: run the semantic self-audit against any chain state.json on demand.
 *   npx tsx scripts/audit-state-semantic.tsx <state.json> [productClass] [model]
 *
 * Reusable operator tool AND the standalone verification path for the audit module
 * (no 14-minute chain run needed). Uses a thin OpenRouter callLlm shim — the same endpoint
 * the chain uses — so the engine stays Anthropic-free. Requires OPENROUTER_API_KEY in env.
 */
import { readFileSync } from 'fs'
import { runSemanticSelfAudit, buildAuditDigest, type LlmCaller } from './lib/semantic-self-audit'

const callLlm: LlmCaller = async ({ model, system, user, maxTokens, temperature }) => {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens ?? 4000,
      temperature: temperature ?? 0.1,
    }),
  })
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j: any = await r.json()
  return { text: (j.choices?.[0]?.message?.content ?? '').trim() }
}

async function main() {
  const statePath = process.argv[2]
  if (!statePath) { console.error('usage: audit-state-semantic.tsx <state.json> [productClass] [model]'); process.exit(1) }
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  const productClass = process.argv[3]
    ?? state?.keyMetrics?.product_class ?? state?.parsedBrief?.constraints?.product_class
    ?? state?.complianceGate?.product_class ?? 'unknown'
  const model = process.argv[4]

  // show the deterministic digest first (proves the PURE path independent of the LLM)
  const digest = buildAuditDigest(state, productClass)
  const hardSignals = digest.sections.flatMap(s => s.hardSignals)
  console.error(`\n=== DIGEST (deterministic) — class=${productClass} ===`)
  console.error(`hard-signals: ${hardSignals.length ? hardSignals.join(', ') : '(none)'}`)

  const result = await runSemanticSelfAudit(state, { productClass, callLlm, model })
  console.error(`\n=== SEMANTIC SELF-AUDIT (model=${result.model}) ===`)
  if (!result.ok) { console.error(`FAILED: ${result.error}`); process.exit(2) }
  console.error(`min_score=${result.min_score}  mean_score=${result.mean_score}  blocking_defects=${result.blocking_defects.length}`)
  for (const s of result.sections) {
    const bar = s.score >= 8 ? '✓' : s.blocking ? '✗BLOCK' : '·'
    console.error(`  ${bar} ${s.name}: ${s.score}/10` + (s.defects.length ? ` — ${s.defects.join(' | ')}` : ''))
  }
  console.error(`summary: ${result.summary}`)
  // machine-readable last line
  console.log(JSON.stringify({ class: productClass, min: result.min_score, mean: result.mean_score, blocking: result.blocking_defects.length, ok: result.ok }))
}

main().catch(e => { console.error(e); process.exit(1) })
