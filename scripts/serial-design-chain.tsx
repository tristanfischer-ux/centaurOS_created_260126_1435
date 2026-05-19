#!/usr/bin/env npx tsx
/**
 * scripts/serial-design-chain.tsx
 *
 * Tristan 2026-05-14: end-to-end engineering report engine.
 *
 * Replaces:
 *   - Stage 1.7 multi-emitter (6 emitters + judges + anchor)
 *   - Piece 1F (Grok freewrite module paragraphs)
 *   - Piece 1G (separate brief overview prose)
 *   - cross-module / brief-prose / holistic-review validator scripts
 *
 * With a single coherent chain:
 *   1. Brief parsing (Gemini 3.1 Pro)         — existing PA Stage 1
 *   2. Product classification                 — deterministic
 *   3. Research synthesis (MiMo + Flash-Lite) — existing PA Stage 3
 *   4. Generator (Gemini 3.1 Pro)             — ONE call: brief prose + 10 modules + sub-modules
 *   5. Reviewer 1: Gemini 3.1 Flash-Lite grounded (thinking=high)  — fact verification
 *   6. Reviewer 2: Grok 4.3                                          — engineering coherence
 *   7. Reviewer 3: MiMo V2.5 Pro                                     — manufacturing/sourcing realism
 *   8. Deterministic gates                    — class-arithmetic-gates.ts
 *   9. Natural-language layer                 — pass-through
 *  10. Render PDF
 *
 * Usage:
 *   npx tsx scripts/serial-design-chain.tsx <brief.md> <out-dir>
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
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
  } catch {}
}

import { runBriefParsing } from '../src/lib/pdf-engine-v2/stages/0-brief-generation'
import { runResearchSynthesis } from '../src/lib/pdf-engine-v2/stages/1-research'
import { normaliseProductClass } from '../src/lib/pdf-engine-v2/radical/character-hierarchy'
import { classifyProduct } from '../src/lib/pdf-engine-v2/product-classifier'
import { MODULE_DECOMPOSITION_TAXONOMY_PROMPT } from '../src/lib/pdf-engine-v2/prompts'
import { buildNaturalLanguageLayer } from '../src/lib/pdf-engine-v2/radical/sentence-generator'
import {
  scoreModuleAllGates,
  scoreCrossModuleAllGates,
} from '../src/lib/pdf-engine-v2/radical/class-arithmetic-gates'

// ─── Model constants (matched against benchmark-data-2026-05.md) ───────────

const GEMINI_3_1_PRO = 'google/gemini-3.1-pro-preview'         // generator: knowledge #1
const FLASH_LITE = 'google/gemini-3.1-flash-lite'              // R1: 8.2% hallucination, Google-grounded
const GROK_4_3 = 'x-ai/grok-4.3'                                // R2: 25% hall, IFBench #1
const MIMO = 'xiaomi/mimo-v2.5-pro'                             // R3: 25% hall, manufacturing prior

// ─── LLM helper ─────────────────────────────────────────────────────────────

async function callLlm(opts: {
  model: string
  system: string
  user: string
  maxTokens?: number
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
  groundWithGoogleSearch?: boolean
  timeoutMs?: number
}): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 1_200_000)

  const body: any = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: 0,
    max_tokens: opts.maxTokens ?? 150_000,
  }
  if (opts.model === FLASH_LITE) {
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
    throw new Error(`OpenRouter ${response.status} from ${opts.model}: ${await response.text().catch(() => '?').then(t => t.slice(0, 500))}`)
  }
  const json = (await response.json()) as any
  return (json.choices?.[0]?.message?.content ?? '').trim()
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
  throw new Error(`Could not parse JSON. Head: ${s.slice(0, 300)}`)
}

// ─── Prompts ────────────────────────────────────────────────────────────────

/**
 * Generator system prompt — extends the existing taxonomy prompt with a
 * required `brief_overview_prose` field so the brief section and module
 * decomposition come from the same LLM call in the same worldview.
 */
function buildGeneratorSystem(): string {
  return `${MODULE_DECOMPOSITION_TAXONOMY_PROMPT}

=== ADDITIONAL FIELD: brief_overview_prose ===

In addition to all the fields already specified above, your output JSON MUST include a top-level field "brief_overview_prose" with four sub-fields:

  "brief_overview_prose": {
    "overview_and_context": "<2-3 paragraph plain English describing what the product is, its containerised approach, the regulatory standards applied, and the rationale for the chosen architecture. Numbers MUST match derived_parameters of the relevant module>",
    "mission_statement": "<one-sentence mission. Use the brief's cost ceiling, deployment time, and target market verbatim>",
    "target_customers": "<two sentences: primary and secondary customer segments specific to the product class>",
    "why_now": "<one paragraph on the market timing: policy drivers, technology cost trajectory, regulatory tailwinds>"
  }

All numbers in this prose MUST match numbers in the modules array's derived_parameters. Do NOT invent figures here that are not in the structured data.`
}

const REVIEWER_1_SYSTEM = `You are Reviewer 1 in a 3-stage engineering design review for a hardware product. You are Gemini 3.1 Flash-Lite with Google Search grounding enabled — your job is FACT VERIFICATION against the real world.

The user message contains the brief, the research synthesis, and a full engineering design JSON. The design includes a brief_overview_prose block and 10 modules with derived_parameters and sub-modules.

YOUR JOB:
1. Cross-reference every concrete factual claim (part numbers, voltage/current ratings, manufacturer specs, regulatory standards) against real-world data via your Google Search grounding.
2. Identify hallucinated specs: contactor ratings that don't match nameplate, made-up part numbers, wrong regulatory references, capacity figures that don't match the cell chemistry quoted, etc.
3. Apply targeted edits to fix the wrong numbers / wrong part choices.
4. Do NOT regenerate prose. Do NOT change sub-module IDs. Do NOT add or remove modules.
5. Preserve the schema exactly. Return the FULL corrected JSON.

OUTPUT POLICY:
- Edit in place. Where a number is wrong, fix it. Where a part is unsourceable, swap to a real part.
- Update overview_paragraph_en / brief_overview_prose to keep prose consistent with any number you changed.
- Return ONLY the corrected JSON. No preamble. No markdown fences.`

const REVIEWER_2_SYSTEM = `You are Reviewer 2 in a 3-stage engineering design review. You are Grok 4.3 — joint-lowest hallucination rate, IFBench #1, T-bench #1. Your job is ENGINEERING COHERENCE.

The user message contains the brief, the research synthesis, the post-Reviewer-1 design JSON.

YOUR JOB:
1. Cross-module coherence — verify shared quantities agree across modules: dc_bus_voltage_v, rack_count, cooling_capacity_kw vs heat load, current ratings vs peak power, mass budget vs sum of parts. Pick the value that best matches the brief and apply consistently.
2. Control-loop closure — every sensor in sensing_instrumentation must have a controller that reads it; every controller-commanded actuator must exist; safety interlocks present.
3. Missing functional sub-systems — if the brief mandates "liquid-cooled thermal management", energy_storage_source must contain cold plates / manifolds / pumps, not just NTC sensors.
4. Brief constraints reflected — every brief-stated requirement (cost ceiling, mass limit, dimensions, performance) appears in at least one module's derived_parameters within tolerance.
5. Headroom rules — bus current rating ≥ peak_power_w / dc_voltage_v × 1.15; contactor rating ≥ peak_current × 1.25; cooling ≥ heat estimate × 1.25.

EDIT POLICY:
- Apply minimum changes to resolve each issue. Preserve everything else.
- Do NOT add or remove modules. Stay at the same module count.
- Update overview_paragraph_en + brief_overview_prose in line with any number changes.
- Return the FULL corrected JSON. ONLY JSON. No preamble.`

const REVIEWER_3_SYSTEM = `You are Reviewer 3 in a 3-stage engineering design review. You are MiMo V2.5 Pro — consumer-electronics and manufacturing lineage, GDPval Elo 1571 (real-world work #5). Your job is MANUFACTURING AND SOURCING REALISM.

The user message contains the brief, the research synthesis, and the post-Reviewer-2 design JSON.

YOUR JOB:
1. Sourcing realism — every part should be sourceable from a real manufacturer at the stated quantity. Flag exotic parts where commodity exists; flag commodity where exotic is needed for the environment.
2. Manufacturing plausibility — assembly sequence implied by the modules must be physically possible in a 40-foot ISO container during factory assembly within the brief's lead time.
3. Cost plausibility — sum-of-parts cost must be plausible against the brief's cost ceiling. Flag designs that clearly cannot meet the ceiling (e.g. exotic cell chemistry, gold-plated copper).
4. Lead-time realism — long-lead parts (transformers, custom controllers, EV charger cabling) flagged where they may break the brief's deployment timeline.
5. Batch-size sanity — assembly intensity per unit consistent with the brief's annual batch volume.

EDIT POLICY:
- Apply minimum changes. Where a part is exotic-but-unnecessary, swap to commodity. Where lead time is impossible, swap to alternative architecture.
- Do NOT change module structure. Do NOT add or remove modules.
- Update overview_paragraph_en + brief_overview_prose in line with changes.
- Return the FULL corrected JSON. ONLY JSON.`

// ─── Step orchestration ────────────────────────────────────────────────────

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  console.error(`\n[chain] ${label} ...`)
  const result = await fn()
  console.error(`[chain] ${label} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return result
}

function logGates(modules: any[], productClass: string | null): void {
  console.error(`\n[chain] === Deterministic gate evaluation (class=${productClass}) ===`)
  let totalScore = 0
  let fails = 0
  for (const m of modules) {
    const r = scoreModuleAllGates(m, productClass)
    totalScore += r.score
    if (r.score < 0) fails++
    if (r.reasons.length > 0) {
      console.error(`  ${m.module}: ${r.score >= 0 ? '✓' : '✗'} score=${r.score}`)
      for (const reason of r.reasons) {
        if (reason.includes('FAIL') || reason.includes('UNDER')) console.error(`    ✗ ${reason}`)
        else if (reason.includes('OK')) console.error(`    ✓ ${reason}`)
        else console.error(`    · ${reason}`)
      }
    }
  }
  const cross = scoreCrossModuleAllGates(modules, productClass)
  totalScore += cross.score
  console.error(`  CROSS-MODULE: score=${cross.score}`)
  for (const reason of cross.reasons) {
    if (reason.includes('FAIL') || reason.includes('UNDER')) console.error(`    ✗ ${reason}`)
    else if (reason.includes('OK')) console.error(`    ✓ ${reason}`)
    else console.error(`    · ${reason}`)
  }
  console.error(`[chain] TOTAL gate score: ${totalScore} (${fails} module-fails)`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: serial-design-chain.tsx <brief.md> <out-dir>')
    process.exit(1)
  }
  const briefPath = resolve(args[0])
  const outDir = resolve(args[1])
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const brief = readFileSync(briefPath, 'utf-8')
  console.error(`[chain] brief: ${briefPath} (${brief.length} chars)`)

  // ─── STEP 1: Brief parsing ─────────────────────────────────────────────
  const parsedResult = await runStep('STEP 1: Brief parsing (Gemini 3.1 Pro)', () =>
    runBriefParsing(brief),
  )
  if (!parsedResult.ok || !parsedResult.data) {
    throw new Error(`Brief parsing failed: ${parsedResult.error}`)
  }
  const parsedBrief = parsedResult.data
  writeFileSync(resolve(outDir, '1-parsed-brief.json'), JSON.stringify(parsedBrief, null, 2))

  // ─── STEP 2: Classification ─────────────────────────────────────────────
  // Uses the existing keyword classifier (stages/product-classifier.ts).
  // Takes raw brief text and matches against known product class signatures.
  const classification = classifyProduct(brief)
  const productClass = normaliseProductClass(classification.productClass) || classification.productClass
  console.error(`[chain] STEP 2 classification: raw="${classification.productClass}" → normalised="${productClass}" (confidence=${classification.confidence})`)

  // ─── STEP 3: Research synthesis ─────────────────────────────────────────
  const researchResult = await runStep('STEP 3: Research synthesis (MiMo + Flash-Lite fallback)', () =>
    runResearchSynthesis(parsedBrief, productClass),
  )
  const research = researchResult.ok ? researchResult.data : null
  if (!research) console.error('[chain] WARN: research synthesis failed; continuing without it')
  writeFileSync(resolve(outDir, '3-research.json'), JSON.stringify(research, null, 2))

  // ─── STEP 4: GENERATOR (Gemini 3.1 Pro) ─────────────────────────────────
  const genSystem = buildGeneratorSystem()
  const genUser = `PRODUCT BRIEF (raw):
${brief}

PARSED CONSTRAINTS:
${JSON.stringify(parsedBrief, null, 2)}

RESEARCH SYNTHESIS:
${research ? JSON.stringify(research, null, 2) : '(not available)'}

Generate the full engineering decomposition (brief_overview_prose + modules + sub-modules + cross_module_grammar_links + excluded_modules + rationale_excluded) per the system prompt. Make every number internally consistent. Return ONLY JSON.`

  const generatorRaw = await runStep('STEP 4: Generator (Gemini 3.1 Pro)', () =>
    callLlm({
      model: GEMINI_3_1_PRO,
      system: genSystem,
      user: genUser,
      maxTokens: 150_000,
      timeoutMs: 900_000,
    }),
  )
  writeFileSync(resolve(outDir, '4-generator.raw.txt'), generatorRaw)
  let design = parseJsonLoose(generatorRaw)
  writeFileSync(resolve(outDir, '4-generator.json'), JSON.stringify(design, null, 2))
  console.error(`[chain] Generator output: ${design.modules?.length ?? 0} modules`)
  logGates(design.modules ?? [], productClass)

  // ─── STEP 5: REVIEWER 1 (Flash-Lite grounded, fact verification) ────────
  const r1User = `BRIEF:
${brief}

PARSED CONSTRAINTS:
${JSON.stringify(parsedBrief, null, 2)}

DESIGN TO FACT-CHECK:
${JSON.stringify(design, null, 2)}

Apply targeted edits and return the FULL corrected JSON.`
  const r1Raw = await runStep('STEP 5: Reviewer 1 (Flash-Lite grounded, fact check)', () =>
    callLlm({
      model: FLASH_LITE,
      system: REVIEWER_1_SYSTEM,
      user: r1User,
      maxTokens: 150_000,
      thinkingLevel: 'high',
      groundWithGoogleSearch: true,
      timeoutMs: 600_000,
    }),
  )
  writeFileSync(resolve(outDir, '5-reviewer1.raw.txt'), r1Raw)
  design = parseJsonLoose(r1Raw)
  writeFileSync(resolve(outDir, '5-reviewer1.json'), JSON.stringify(design, null, 2))
  logGates(design.modules ?? [], productClass)

  // ─── STEP 6: REVIEWER 2 (Grok 4.3, engineering coherence) ──────────────
  const r2User = `BRIEF:
${brief}

PARSED CONSTRAINTS:
${JSON.stringify(parsedBrief, null, 2)}

DESIGN (post-Reviewer-1):
${JSON.stringify(design, null, 2)}

Apply edits for cross-module engineering coherence. Return the FULL corrected JSON.`
  const r2Raw = await runStep('STEP 6: Reviewer 2 (Grok 4.3, engineering coherence)', () =>
    callLlm({
      model: GROK_4_3,
      system: REVIEWER_2_SYSTEM,
      user: r2User,
      maxTokens: 150_000,
      timeoutMs: 900_000,
    }),
  )
  writeFileSync(resolve(outDir, '6-reviewer2.raw.txt'), r2Raw)
  design = parseJsonLoose(r2Raw)
  writeFileSync(resolve(outDir, '6-reviewer2.json'), JSON.stringify(design, null, 2))
  logGates(design.modules ?? [], productClass)

  // ─── STEP 7: REVIEWER 3 (MiMo, manufacturing realism) ──────────────────
  const r3User = `BRIEF:
${brief}

DESIGN (post-Reviewer-2):
${JSON.stringify(design, null, 2)}

Apply edits for sourcing / manufacturing / cost realism. Return the FULL corrected JSON.`
  const r3Raw = await runStep('STEP 7: Reviewer 3 (MiMo, manufacturing realism)', () =>
    callLlm({
      model: MIMO,
      system: REVIEWER_3_SYSTEM,
      user: r3User,
      maxTokens: 150_000,
      timeoutMs: 900_000,
    }),
  )
  writeFileSync(resolve(outDir, '7-reviewer3.raw.txt'), r3Raw)
  design = parseJsonLoose(r3Raw)
  writeFileSync(resolve(outDir, '7-reviewer3.json'), JSON.stringify(design, null, 2))

  // ─── STEP 8: Deterministic gate ────────────────────────────────────────
  console.error(`\n[chain] === STEP 8: Deterministic gate (final, accept-or-fail) ===`)
  logGates(design.modules ?? [], productClass)
  // Gate doesn't reject here yet — we surface the result. Hard accept/fail
  // logic gets added once we've seen real iter output shape.

  // ─── STEP 9: Natural-language layer (pass-through) ─────────────────────
  const nl = buildNaturalLanguageLayer((design.modules ?? []) as any)
  for (const m of design.modules ?? []) {
    const entry = (nl as any).by_module?.[m.module]
    if (entry && m.overview_paragraph_en) entry.paragraph_en_llm = m.overview_paragraph_en
  }

  // ─── STEP 10: Save state.json ──────────────────────────────────────────
  const state = {
    projectId: 'serial-chain-' + Date.now(),
    parsedBrief,
    moduleDecomposition: design,
    naturalLanguageLayer: nl,
    briefOverviewProse: design.brief_overview_prose ?? null,
    grammarVerdicts: null,
    savedAt: new Date().toISOString(),
  }
  const statePath = resolve(outDir, 'state.json')
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  console.error(`\n[chain] state.json → ${statePath}`)

  // ─── STEP 11: Render PDF ───────────────────────────────────────────────
  const pdfPath = resolve(outDir, 'serial-chain.pdf')
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), statePath, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  })
  execFileSync('open', [pdfPath])
  console.error(`[chain] opened ${pdfPath}`)
}

main().catch(err => {
  console.error('[chain] FATAL:', err)
  process.exit(1)
})
