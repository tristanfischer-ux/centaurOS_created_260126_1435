#!/usr/bin/env npx tsx
// Fast Flash-Lite audit across all completed iter-62 state.json files.
// Sends a compact summary of brief + modules + parts + decisions to Flash-Lite
// and asks for a structured 0-10 quality score per dimension plus concrete
// issues. Parallel across classes; ~5s per call, ~£0.005/call.
//
// Audit dimensions:
// 1. brief_to_design_fidelity — does the design satisfy the stated brief constraints?
// 2. engineering_plausibility — physics/spec values, do they hold together?
// 3. internal_coherence — modules link sensibly, no contradictions
// 4. part_realism — surviving BoM entries look like real components
// 5. honesty_signal — uncertain items honestly flagged, no over-confident claims
//
// Usage: npx tsx scripts/flash-audit-iter62.tsx [iter-prefix=iter-62]

import { readFileSync, existsSync, writeFileSync } from 'fs'

const CLASSES = ['cgm', 'drone', 'edge-ai', 'heatpump', 'ev-charger', 'bioreactor', 'vertical-farm', 'auv', 'bess-container', 'haps']
const FLASH_LITE = 'google/gemini-2.5-flash-lite'

const KEY = (() => {
  try {
    const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
    const m = env.match(/OPENROUTER_API_KEY=(.+)/)
    return m ? m[1].trim() : ''
  } catch { return '' }
})()

if (!KEY) { console.error('OPENROUTER_API_KEY missing'); process.exit(1) }

function compactStateForAudit(state: any): any {
  const mods = state.moduleDecomposition?.modules ?? []
  const links = state.moduleDecomposition?.cross_module_grammar_links ?? []

  const compactModules = mods.map((m: any) => ({
    module: m.module,
    display_name: m.display_name,
    sub_modules: (m.sub_modules ?? []).map((sm: any) => ({
      sub_module_id: sm.sub_module_id,
      english_sentence: sm.english_sentence,
      words: (sm.words ?? []).map((w: any) => ({
        word_id: w.word_id,
        word_name: w.word_name,
        modifier_characters: w.modifier_characters ?? {},
      })),
    })),
  }))

  return {
    project: state.projectId,
    brief: {
      product: state.parsedBrief?.product_class ?? state.parsedBrief?.product_type,
      constraints: state.parsedBrief?.constraints ?? state.parsedBrief?.specs,
    },
    keyMetrics: state.keyMetrics,
    moduleCount: mods.length,
    crossLinkCount: links.length,
    modules: compactModules,
    partVerificationSummary: state.partVerificationSummary,
    designDecisionsCount: (state.designDecisions ?? []).length,
    acceptanceStatus: state.acceptanceStatus,
    sampleRecommendations: (state.partRecommendations ?? []).slice(0, 5),
  }
}

const PROMPT_TEMPLATE = (compactState: any) => `You are auditing a generated engineering design document. Score it on five dimensions (0-10 each) and list the concrete issues you find.

Audit dimensions:
1. brief_to_design_fidelity — does the design actually satisfy the constraints in the brief? Are the headline numbers consistent with what was asked for?
2. engineering_plausibility — do the physics/spec values hold together? (current ratings vs cable sizes, thermal paths cover heat sources, mass/volume sane, voltage classes consistent)
3. internal_coherence — do modules link sensibly to each other? Are there orphan sub-modules with no grammar_links? Are cross-links semantically correct (a sensor connects to a controller, not to a structural mount)?
4. part_realism — do the SURVIVING (manufacturer, part_number) pairs in the BoM look like real components? Spot-check 5 random sub-modules for fabrication-by-style (e.g. "Mersen 2MCB1500", "Tata Steel CP-1200-5MM" sound real but may not exist).
5. honesty_signal — are uncertain items honestly flagged? Is the engine claiming false confidence anywhere?

Be specific. Quote sub_module_ids and word_ids. If a value is wrong, say what it should be and why.

Return ONLY this JSON (no markdown fences):
{
  "scores": {
    "brief_to_design_fidelity": <0-10>,
    "engineering_plausibility": <0-10>,
    "internal_coherence": <0-10>,
    "part_realism": <0-10>,
    "honesty_signal": <0-10>
  },
  "headline": "<one sentence overall summary>",
  "top_issues": [
    {"dimension": "<one of above>", "severity": "low|med|high", "where": "<module/sub_module>", "issue": "<concrete description>"}
  ],
  "what_worked": ["<one or two things this design got right>"]
}

DESIGN UNDER AUDIT:
${JSON.stringify(compactState, null, 2).slice(0, 80_000)}
`

async function auditOne(cls: string, prefix: string): Promise<any> {
  const statePath = `/Users/tristanfischer/Downloads/bess-iter/${prefix}-${cls}/container/state.json`
  if (!existsSync(statePath)) return { cls, error: 'no state' }

  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  const compact = compactStateForAudit(state)
  const prompt = PROMPT_TEMPLATE(compact)

  const t0 = Date.now()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://forge-os.com/audit',
    },
    body: JSON.stringify({
      model: FLASH_LITE,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0,
    }),
  })
  if (!res.ok) return { cls, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
  const body = await res.json()
  const text = body.choices?.[0]?.message?.content ?? ''
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  let parsed: any = null
  try { parsed = JSON.parse(text) } catch (e) {
    return { cls, error: 'parse fail', raw: text.slice(0, 500), elapsed }
  }
  return { cls, elapsed, ...parsed }
}

async function main() {
  const prefix = process.argv[2] || 'iter-62'
  const targets: string[] = []
  for (const c of CLASSES) {
    const p = `/Users/tristanfischer/Downloads/bess-iter/${prefix}-${c}/container/state.json`
    if (existsSync(p)) targets.push(c)
  }
  console.log(`Flash-Lite audit across ${targets.length} classes: ${targets.join(', ')}`)
  console.log(`Model: ${FLASH_LITE}\n`)

  const results = await Promise.all(targets.map(c => auditOne(c, prefix)))

  // Print summary table
  console.log('='.repeat(120))
  console.log('CLASS           BRIEF  PHYS  COH   PART  HON   AVG   HEADLINE')
  console.log('='.repeat(120))
  for (const r of results) {
    if (r.error) {
      console.log(`${r.cls.padEnd(15)} ERROR: ${r.error}`)
      continue
    }
    const s = r.scores || {}
    const vals = [s.brief_to_design_fidelity, s.engineering_plausibility, s.internal_coherence, s.part_realism, s.honesty_signal]
    const valid = vals.filter(v => typeof v === 'number')
    const avg = valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : '-'
    console.log(
      `${r.cls.padEnd(15)} ` +
      vals.map(v => String(v ?? '-').padStart(5)).join(' ') +
      `  ${String(avg).padStart(4)}  ` +
      (r.headline || '').slice(0, 65)
    )
  }
  console.log('='.repeat(120))

  // Top issues across all classes
  console.log('\nTop issues (severity=high or med) across all classes:\n')
  for (const r of results) {
    if (!r.top_issues) continue
    const high = r.top_issues.filter((i: any) => i.severity === 'high' || i.severity === 'med')
    if (high.length === 0) continue
    console.log(`  ${r.cls}:`)
    for (const i of high) {
      console.log(`    [${i.severity}] ${i.dimension} @ ${i.where}: ${i.issue}`)
    }
  }

  // Persist
  const outPath = `/Users/tristanfischer/Downloads/bess-iter/${prefix}-flash-audit.json`
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nFull audit saved to ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
