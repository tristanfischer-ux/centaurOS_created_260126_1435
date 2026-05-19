#!/usr/bin/env npx tsx
/**
 * scripts/serial-flash-grok.tsx
 *
 * Tristan experiment 2026-05-13: test pure-serial Flash-Lite → Grok 4.3
 * against the parallel multi-emitter anchor-mode path.
 *
 * Pipeline:
 *   1. Gemini 3.1 Flash-Lite (thinking=high, google-search grounded) drafts
 *      the full module decomposition (modules + sub-modules + words +
 *      overview_paragraph_en + cross-module links).
 *   2. Grok 4.3 reads brief + draft and corrects ONLY arithmetic / engineering
 *      mistakes. Keeps prose intact otherwise.
 *   3. State.json written in the same shape Stage 1.7 produces. Render with
 *      scripts/render-minimal-pdf.tsx for direct visual comparison.
 *
 * Usage:
 *   npx tsx scripts/serial-flash-grok.tsx <brief-file> <out-dir>
 *
 * Out files in <out-dir>:
 *   - flash-draft.json     — Flash-Lite raw output
 *   - grok-corrected.json  — Grok corrected output
 *   - state.json           — final pipeline-shape state
 *   - path-b.pdf           — rendered PDF
 */

// Load .env.local + tavily.env + distributor secrets — mirror run.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { homedir } from 'os'
import { execFileSync } from 'child_process'

for (const envPath of [
  resolve(process.cwd(), '.env.local'),
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
import { buildNaturalLanguageLayer } from '../src/lib/pdf-engine-v2/radical/sentence-generator'

const GEMINI_3_1_FLASH_LITE = 'google/gemini-3.1-flash-lite'
const GROK_4_3 = 'x-ai/grok-4.3'

// ─── OpenRouter call helpers ────────────────────────────────────────────────

async function callLlm(opts: {
  model: string
  systemPrompt: string
  userContent: string
  maxTokens?: number
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
  groundWithGoogleSearch?: boolean
  temperature?: number
  timeoutMs?: number
}): Promise<{ text: string; finishReason: string | undefined }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 1_200_000)

  const body: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userContent },
    ],
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 150_000,
  }
  if (opts.model === GEMINI_3_1_FLASH_LITE) {
    if (opts.thinkingLevel) body.thinking_level = opts.thinkingLevel
    if (opts.groundWithGoogleSearch) body.google_search_grounding = { enabled: true }
  }

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '(no body)')
    throw new Error(`OpenRouter ${response.status} from ${opts.model}: ${errText.slice(0, 500)}`)
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = json.choices?.[0]
  return {
    text: (choice?.message?.content ?? '').trim(),
    finishReason: choice?.finish_reason,
  }
}

// ─── JSON repair (lifted from llm-json pattern) ─────────────────────────────

function parseJsonLoose(raw: string): any {
  let s = raw.trim()
  // strip markdown fences
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
  // try direct parse
  try { return JSON.parse(s) } catch {}
  // try first { ... last }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) } catch {}
  }
  throw new Error(`Could not parse JSON. Head: ${s.slice(0, 200)} ... Tail: ${s.slice(-200)}`)
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: serial-flash-grok.tsx <brief-file> <out-dir>')
    process.exit(1)
  }
  const briefPath = resolve(args[0])
  const outDir = resolve(args[1])
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const brief = readFileSync(briefPath, 'utf-8')
  console.error(`[serial-flash-grok] brief: ${briefPath} (${brief.length} chars)`)

  // ─── Step 1: Flash-Lite draft (grounded, thinking=high) ────────────────
  console.error(`\n[serial-flash-grok] STEP 1: Flash-Lite drafting (grounded, thinking=high)...`)
  const flashUserMsg = `Decompose the hardware product described in this brief into the 12 universal engineering modules per the system schema in the system message. Emit the FULL JSON object — every module needs derived_parameters, sub_modules, grammar_links, overview_paragraph_en. Every sub_module needs words[], english_sentence, rad_syntax.

PRODUCT BRIEF:
${brief}

Return ONLY the JSON object, no preamble, no markdown fences.`

  const t1 = Date.now()
  const flashRaw = await callLlm({
    model: GEMINI_3_1_FLASH_LITE,
    systemPrompt: MODULE_DECOMPOSITION_TAXONOMY_PROMPT,
    userContent: flashUserMsg,
    maxTokens: 150_000,
    thinkingLevel: 'high',
    groundWithGoogleSearch: true,
    timeoutMs: 900_000,
  })
  console.error(`[serial-flash-grok] Flash-Lite finished (${Date.now() - t1}ms, finish=${flashRaw.finishReason}, ${flashRaw.text.length} chars)`)
  writeFileSync(resolve(outDir, 'flash-draft.raw.txt'), flashRaw.text)

  const flashDraft = parseJsonLoose(flashRaw.text)
  writeFileSync(resolve(outDir, 'flash-draft.json'), JSON.stringify(flashDraft, null, 2))
  console.error(`[serial-flash-grok] Flash-Lite draft parsed: ${flashDraft.modules?.length ?? 0} modules`)

  // ─── Step 2: Grok 4.3 correction pass ──────────────────────────────────
  console.error(`\n[serial-flash-grok] STEP 2: Grok 4.3 correcting arithmetic / engineering...`)
  const grokSystem = `You are a senior systems engineer reviewing a hardware product module decomposition for ARITHMETIC and ENGINEERING correctness. Your job is to find and FIX numerical errors while preserving everything else about the structure.

INVARIANTS THAT MUST HOLD per module (where applicable):
- Energy storage: cell_count × cell_voltage_v × cell_capacity_ah / 1000 == capacity_kwh_total (within 1 %).
- Module/cell counting: module_count × cells_per_module == cell_count (exact).
- Pack current: rated_power_w / dc_bus_voltage_v == pack_current_continuous_a (within 1 %).
- Brief-stated constraints (cost ceiling, mass limit, dimensions, performance) MUST appear in derived_parameters for the relevant module.
- Mentioned numbers in overview_paragraph_en MUST match derived_parameters or words[].character/modifier quantities.

YOUR EDIT POLICY:
- Fix BROKEN numbers. If cells × Ah × V doesn't close, change cell_count OR cell_capacity_ah OR cell_voltage_v so it does — pick the value that's clearly an LFP standard (e.g. 280 Ah, 3.2 V) and adjust the other.
- Update both derived_parameters AND the corresponding numbers in overview_paragraph_en + sub_module sentences to stay consistent.
- DO NOT regenerate prose. DO NOT change sub_module IDs. DO NOT add or remove modules. Keep everything else as-is.
- Return the FULL corrected JSON object (same top-level shape, all modules present).

Output ONLY the JSON, no preamble, no markdown fences.`

  const grokUserMsg = `BRIEF:
${brief}

DRAFT TO REVIEW (from Flash-Lite, grounded):
${JSON.stringify(flashDraft, null, 2)}

Return the corrected JSON.`

  const t2 = Date.now()
  const grokRaw = await callLlm({
    model: GROK_4_3,
    systemPrompt: grokSystem,
    userContent: grokUserMsg,
    maxTokens: 150_000,
    temperature: 0,
    timeoutMs: 900_000,
  })
  console.error(`[serial-flash-grok] Grok 4.3 finished (${Date.now() - t2}ms, finish=${grokRaw.finishReason}, ${grokRaw.text.length} chars)`)
  writeFileSync(resolve(outDir, 'grok-corrected.raw.txt'), grokRaw.text)

  const grokCorrected = parseJsonLoose(grokRaw.text)
  writeFileSync(resolve(outDir, 'grok-corrected.json'), JSON.stringify(grokCorrected, null, 2))
  console.error(`[serial-flash-grok] Grok corrected: ${grokCorrected.modules?.length ?? 0} modules`)

  // ─── Step 3: Assemble state.json in the shape the renderer expects ─────
  console.error(`\n[serial-flash-grok] STEP 3: Building state.json...`)
  const naturalLanguageLayer = buildNaturalLanguageLayer(grokCorrected.modules ?? [])

  // Best-effort briefOverviewProse — pull from the most recent iter state if
  // present (we're testing module accuracy, not brief prose), else leave null.
  let briefOverviewProse: any = null
  const iter11State = resolve(homedir(), 'Downloads/bess-iter/iter-11/bess-container/state.json')
  if (existsSync(iter11State)) {
    try {
      const prev = JSON.parse(readFileSync(iter11State, 'utf-8'))
      briefOverviewProse = prev.briefOverviewProse ?? null
    } catch {}
  }

  const state = {
    projectId: 'bess-iter-12B-serial',
    moduleDecomposition: grokCorrected,
    naturalLanguageLayer,
    briefOverviewProse,
    grammarVerdicts: null,
    savedAt: new Date().toISOString(),
  }
  const statePath = resolve(outDir, 'state.json')
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  console.error(`[serial-flash-grok] state.json → ${statePath}`)

  // ─── Step 4: Render ─────────────────────────────────────────────────────
  const pdfPath = resolve(outDir, 'path-b.pdf')
  console.error(`\n[serial-flash-grok] STEP 4: Rendering PDF...`)
  try {
    execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), statePath, pdfPath], {
      stdio: 'inherit',
      cwd: resolve(__dirname, '..'),
    })
    console.error(`[serial-flash-grok] PDF → ${pdfPath}`)
    execFileSync('open', [pdfPath])
  } catch (err) {
    console.error(`[serial-flash-grok] render/open failed:`, err)
  }
}

main().catch(err => {
  console.error('[serial-flash-grok] FATAL:', err)
  process.exit(1)
})
