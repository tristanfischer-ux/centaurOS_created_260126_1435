#!/usr/bin/env npx tsx
/**
 * @file scripts/test-k10-prompt-addenda-rerun.tsx
 *
 * @description One-shot fresh-emission test for the 7 K10 prompt addenda
 *   added to MODULE_DECOMPOSITION_TAXONOMY_PROMPT (2026-05-18 dispatch).
 *
 *   For each of 4 datapoints (BESS×2, heat-pump, EV-charger):
 *     1. Read the brief text + product_class hint.
 *     2. Call a single emitter (Grok 4.3 by default; override with K10_RERUN_MODEL).
 *     3. Parse JSON, build a minimal ModuleDecomposition.
 *     4. Run K10 shadow validation, print missing_required summary.
 *
 *   Bypasses the full multi-emitter pipeline so we can verify the prompt
 *   change in isolation at minimum cost.
 *
 * @usage  npx tsx scripts/test-k10-prompt-addenda-rerun.tsx [bess1|bess2|heatpump|ev|all]
 *         K10_RERUN_MODEL=x-ai/grok-4.3 npx tsx scripts/test-k10-prompt-addenda-rerun.tsx all
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

// ─── env loading (mirror serial-flash-grok) ─────────────────────────────────
for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
  resolve(homedir(), '.claude/secrets/tavily.env'),
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
  } catch { /* missing env file ok */ }
}

import { MODULE_DECOMPOSITION_TAXONOMY_PROMPT } from '../src/lib/pdf-engine-v2/prompts'
import { runK10ShadowValidation } from '../src/lib/pdf-engine-v2/stages/1.7-module-decomposition'
import type { ModuleDecomposition } from '../src/lib/pdf-engine-v2/types/module-decomposition'

type Datapoint = {
  name: string
  briefPath: string
  productClass: string
  baselineMissing: number
}

const DATAPOINTS: Datapoint[] = [
  { name: 'bess1',    briefPath: '/tmp/k10-rerun-brief-bess1.txt',    productClass: 'energy_storage',      baselineMissing: 5 },
  { name: 'bess2',    briefPath: '/tmp/k10-rerun-brief-bess2.txt',    productClass: 'energy_storage',      baselineMissing: 8 },
  { name: 'heatpump', briefPath: '/tmp/k10-rerun-brief-heatpump.txt', productClass: 'heat_pump',           baselineMissing: 3 },
  { name: 'ev',       briefPath: '/tmp/k10-rerun-brief-ev.txt',       productClass: 'dc_fast_ev_charger',  baselineMissing: 4 },
]

const MODEL = process.env.K10_RERUN_MODEL ?? 'x-ai/grok-4.3'
const OUT_DIR = resolve(process.cwd(), '/tmp/k10-rerun-out')
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

async function callEmitter(brief: string, productClassHint: string): Promise<{ raw: string; tokens: { input: number; output: number } }> {
  const userMsg = `Decompose the hardware product described in this brief into the 12 universal engineering modules per the system schema in the system message. Emit the FULL JSON object — every module needs derived_parameters, sub_modules, grammar_links, overview_paragraph_en. Every sub_module needs words[], english_sentence, rad_syntax. CRITICAL: cross_module_grammar_links must follow the K10 REQUIRED CROSS-MODULE EDGES section of the system prompt — do not skip mechanical_mount-to-structure_containment, do not skip hard-wired safety chains, do not collapse two-edge thermal chains, do not skip the DC distribution panel for BESS, do not collapse Modbus-TCP into one bus link, emit BOTH power+comms edges for EV charging cables, and use detail field for PWM/modulation qualifiers on variable-speed actuators.

PRODUCT CLASS HINT (use as product_class top-level field unless the brief clearly contradicts): ${productClassHint}

PRODUCT BRIEF:
${brief}

Return ONLY the JSON object, no preamble, no markdown fences.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 600_000)

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: MODULE_DECOMPOSITION_TAXONOMY_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0,
        max_tokens: 150_000,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)')
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 500)}`)
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    raw: (json.choices?.[0]?.message?.content ?? '').trim(),
    tokens: {
      input: json.usage?.prompt_tokens ?? 0,
      output: json.usage?.completion_tokens ?? 0,
    },
  }
}

function parseJsonLoose(raw: string): any {
  let s = raw.trim()
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  try { return JSON.parse(s) } catch {}
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch {}
  }
  throw new Error(`Could not parse JSON. Head: ${s.slice(0, 200)} ... Tail: ${s.slice(-200)}`)
}

async function runOne(dp: Datapoint): Promise<{ verdict: string; missing: number; extras: number; protoMis: number; matched: number; missingEdges: any[] }> {
  console.log(`\n═══════ ${dp.name} (${dp.productClass}) ═══════`)
  console.log(`  baseline missing_required: ${dp.baselineMissing}`)
  const brief = readFileSync(dp.briefPath, 'utf-8')
  console.log(`  brief: ${brief.length} chars`)
  console.log(`  model: ${MODEL}`)
  const t0 = Date.now()
  const { raw, tokens } = await callEmitter(brief, dp.productClass)
  console.log(`  emit done (${Date.now() - t0}ms, in=${tokens.input}, out=${tokens.output}, ${raw.length} chars)`)
  writeFileSync(resolve(OUT_DIR, `${dp.name}.raw.txt`), raw)
  let parsed: any
  try {
    parsed = parseJsonLoose(raw)
  } catch (err) {
    console.error(`  PARSE FAILED: ${(err as Error).message}`)
    return { verdict: 'PARSE_FAIL', missing: -1, extras: -1, protoMis: -1, matched: -1, missingEdges: [] }
  }
  writeFileSync(resolve(OUT_DIR, `${dp.name}.parsed.json`), JSON.stringify(parsed, null, 2))
  // Run K10 shadow
  const md = parsed as ModuleDecomposition
  const k10 = await runK10ShadowValidation(md)
  console.log(`  K10 verdict=${k10.verdict}, class=${k10.class || '(none)'}, matched=${k10.matched_edges}, missing=${k10.missing_required.length}, extras=${k10.extra_emitted.length}, proto_mis=${k10.protocol_mismatches.length}`)
  if (k10.reason) console.log(`  reason: ${k10.reason}`)
  if (k10.missing_required.length > 0) {
    console.log(`  --- missing required (${k10.missing_required.length}) ---`)
    for (const m of k10.missing_required) {
      console.log(`    ✗ ${m.from_class} ↔ [${(m as any).protocol ?? m.mechanism ?? '?'}] ${m.to_class}`)
    }
  }
  // diff vs baseline
  const delta = k10.missing_required.length - dp.baselineMissing
  const tag = k10.missing_required.length <= 1 ? 'PASS' : 'FAIL'
  console.log(`  Δ vs baseline: ${delta >= 0 ? '+' : ''}${delta}   (≤1 target: ${tag})`)
  return {
    verdict: k10.verdict,
    missing: k10.missing_required.length,
    extras: k10.extra_emitted.length,
    protoMis: k10.protocol_mismatches.length,
    matched: k10.matched_edges,
    missingEdges: k10.missing_required.map(m => ({
      from: m.from_class, to: m.to_class, mech: m.mechanism, proto: (m as any).protocol,
    })),
  }
}

async function main() {
  const which = (process.argv[2] ?? 'all').toLowerCase()
  const targets = which === 'all' ? DATAPOINTS : DATAPOINTS.filter(d => d.name === which)
  if (targets.length === 0) {
    console.error(`Unknown datapoint: ${which}. Use one of: ${DATAPOINTS.map(d => d.name).join('|')} | all`)
    process.exit(1)
  }
  const results: Array<{ name: string; baseline: number; result: Awaited<ReturnType<typeof runOne>> }> = []
  for (const dp of targets) {
    try {
      const r = await runOne(dp)
      results.push({ name: dp.name, baseline: dp.baselineMissing, result: r })
    } catch (err) {
      console.error(`\n[k10-rerun] ${dp.name} FAILED: ${(err as Error).message}`)
      results.push({ name: dp.name, baseline: dp.baselineMissing, result: { verdict: 'ERROR', missing: -1, extras: -1, protoMis: -1, matched: -1, missingEdges: [] } })
    }
  }
  console.log('\n\n═══════ FINAL ROLL-UP ═══════')
  console.log('  datapoint    baseline_missing -> new_missing   delta    verdict       pass_le_1')
  let passed = 0
  for (const r of results) {
    const delta = r.result.missing - r.baseline
    const pass = r.result.missing >= 0 && r.result.missing <= 1
    if (pass) passed++
    console.log(`  ${r.name.padEnd(10)}   ${String(r.baseline).padStart(3)} -> ${String(r.result.missing).padStart(3)}            ${(delta >= 0 ? '+' : '') + delta}        ${r.result.verdict.padEnd(13)}   ${pass ? 'PASS' : 'FAIL'}`)
  }
  console.log(`\n  Pass criteria: missing_required ≤ 1 on ≥ 3 of 4 datapoints`)
  console.log(`  Actual: ${passed} of ${results.length} pass`)
  console.log(`  ${passed >= 3 ? '✓ OVERALL PASS — proceed to enforcing mode dispatch' : '✗ OVERALL FAIL — iterate on prompt addenda'}`)
  writeFileSync(resolve(OUT_DIR, 'rollup.json'), JSON.stringify({ model: MODEL, results }, null, 2))
  console.log(`\n  rollup → ${resolve(OUT_DIR, 'rollup.json')}`)
  console.log(`  raw emissions → ${OUT_DIR}/*.raw.txt + *.parsed.json`)
  process.exit(0)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(2)
})
