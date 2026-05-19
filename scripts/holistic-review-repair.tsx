#!/usr/bin/env npx tsx
/**
 * scripts/holistic-review-repair.tsx
 *
 * Tristan 2026-05-13: end-to-end LLM review of a complete module decomposition.
 *
 * Goes beyond the deterministic validators (which check arithmetic + shared
 * fields + brief constraints) and reads the design AS A WHOLE to find:
 *   - missing functional sub-systems (inverter without gate drivers, etc.)
 *   - thermal balance issues (heat sources vs sinks)
 *   - architectural incoherence (open control loops, missing interlocks)
 *   - cross-module terminology drift
 *   - brief constraints not reflected anywhere
 *   - internal contradictions between modules
 *
 * Pipeline:
 *   1. Grok 4.3 reviews state.json + brief, returns structured issue list
 *   2. Critical + major issues auto-repaired by a second Grok call
 *   3. Minor issues surfaced but not auto-fixed (might be intentional)
 *   4. Save corrected state.json + render PDF
 *
 * Usage:
 *   npx tsx scripts/holistic-review-repair.tsx <state.json> <brief.md> <out-dir>
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

const GROK_4_3 = 'x-ai/grok-4.3'

interface Issue {
  module: string
  severity: 'critical' | 'major' | 'minor'
  kind: string
  description: string
  suggested_fix: string
}

async function callGrok(systemPrompt: string, userContent: string, maxTokens = 150_000): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 900_000)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROK_4_3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${await response.text().catch(() => '?')}`)
  }
  const json = await response.json() as any
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

// ─── Holistic review ────────────────────────────────────────────────────────

const REVIEW_SYSTEM = `You are a senior systems engineer reviewing a hardware product design end-to-end for engineering correctness and coherence. You have the original product brief and a structured module decomposition (10-12 universal engineering modules, each with sub-modules, parts, derived_parameters, and a plain-English overview paragraph).

Read the ENTIRE design as a coherent engineering whole. Find things that DO NOT MAKE SENSE.

What to look for (in priority order):

1. CRITICAL — Architectural incoherence
   - A subsystem mentioned in one module that has no supporting parts elsewhere (e.g. a control loop references a sensor not declared in sensing_instrumentation)
   - Missing functional sub-system the product CANNOT work without (e.g. a 1 MW inverter without gate drivers, a BESS without precharge, a fluid system without pumps)
   - Open control loops: sensor present but no controller reading it, or controller commanding an actuator that doesn't exist
   - Safety interlocks promised in safety_protection but no triggering sensor anywhere

2. CRITICAL — Brief contradiction
   - A brief-stated requirement is contradicted (e.g. brief says 1 MW, design says 600 kW)
   - A brief-stated regulatory standard is missing from regulatory references in any module
   - Cost / mass / dimension limit violated

3. MAJOR — Thermal / energy balance
   - Heat sources (cell I²R losses, inverter losses, electronics dissipation) exceed cooling capacity
   - Energy in / energy out across modules doesn't balance under stated duty cycle

4. MAJOR — Cross-module terminology / numeric drift
   - Same physical quantity called by different names in different modules without explanation
   - Same field name (e.g. rack_count) used in two modules with disagreeing values when they refer to the same thing
   - Materials / chemistries that conflict (e.g. structure says aluminium, brief says steel)

5. MAJOR — Implausible part choices
   - Exotic parts where commodity would do (e.g. military-grade controller for civilian BESS)
   - Or commodity where the spec demands exotic (e.g. consumer-grade IC in a 50 °C ambient industrial enclosure)
   - Part counts that are wrong by order-of-magnitude

6. MINOR — Prose / detail
   - Sub-module mentioned in module overview but not present in sub_modules array
   - Sub-module exists but not mentioned in overview prose
   - Underscored snake_case ids leaking into the rendered overview prose

For each finding, output ONE issue. Be SPECIFIC: name the module(s) involved, quote the offending field/value, suggest the concrete fix.

Output a JSON object with this shape:

{
  "summary": "<one-sentence overall verdict on the design's engineering coherence>",
  "issues": [
    {
      "module": "<module id, or 'ALL' for cross-module>",
      "severity": "critical|major|minor",
      "kind": "<short label, e.g. 'missing_gate_drivers' or 'thermal_imbalance'>",
      "description": "<specific concrete description of the problem, naming the fields involved>",
      "suggested_fix": "<concrete change: which module, which field, what value>"
    }
  ]
}

If the design IS coherent, return { "summary": "Design is internally coherent.", "issues": [] }. Do not invent issues.

Output ONLY the JSON. No preamble. No markdown fences.`

async function review(modules: any[], brief: string): Promise<{ summary: string; issues: Issue[] }> {
  const userContent = `PRODUCT BRIEF:
${brief}

MODULE DECOMPOSITION TO REVIEW:
${JSON.stringify({ modules }, null, 2)}

Review the design end-to-end. Return the JSON.`

  console.error(`[holistic-review] calling Grok 4.3 for end-to-end design review...`)
  const t0 = Date.now()
  const raw = await callGrok(REVIEW_SYSTEM, userContent)
  console.error(`[holistic-review] Grok responded in ${Date.now() - t0}ms (${raw.length} chars)`)
  const parsed = parseJsonLoose(raw)
  return {
    summary: parsed.summary ?? '(no summary)',
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  }
}

// ─── Repair ──────────────────────────────────────────────────────────────────

const REPAIR_SYSTEM = `You are a senior systems engineer correcting a hardware product module decomposition. You will receive the brief, the current modules, and a structured list of issues identified by an end-to-end review. Your job is to apply the MINIMUM changes needed to resolve every critical and major issue while preserving everything else.

EDIT POLICY:
- Apply each suggested fix. If the suggested fix is wrong, make a better fix that addresses the underlying issue.
- Edit derived_parameters, overview_paragraph_en, sub_modules, words as needed.
- Do NOT add new modules, do NOT remove modules. Stay at the same module count.
- For missing functional sub-systems: add a new entry to the appropriate module's sub_modules array (with id, name_human, words[], english_sentence) and mention it in the module overview.
- For thermal/balance issues: adjust the cooling capacity or heat-source ratings to balance.
- For cross-module drift: pick the value that best matches the brief and apply consistently across all modules that use that field.
- Update overview_paragraph_en where you change underlying numbers — keep prose and numbers consistent.

Return the FULL corrected modules array as { "modules": [...] }. Same shape, all original modules present. Output ONLY JSON, no preamble.`

async function repair(modules: any[], issues: Issue[], brief: string): Promise<any[]> {
  if (issues.length === 0) return modules
  const userContent = `BRIEF:
${brief}

CURRENT MODULES:
${JSON.stringify({ modules }, null, 2)}

ISSUES TO FIX (apply minimum changes):
${issues.map(i => `[${i.severity.toUpperCase()} / ${i.module} / ${i.kind}] ${i.description}\n  → ${i.suggested_fix}`).join('\n\n')}

Return the corrected JSON.`

  console.error(`[holistic-review] calling Grok 4.3 to repair ${issues.length} issues...`)
  const t0 = Date.now()
  const raw = await callGrok(REPAIR_SYSTEM, userContent)
  console.error(`[holistic-review] Grok repair responded in ${Date.now() - t0}ms (${raw.length} chars)`)
  const parsed = parseJsonLoose(raw)
  if (!parsed.modules || !Array.isArray(parsed.modules)) {
    throw new Error('Repair response did not contain modules array')
  }
  return parsed.modules
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 3) {
    console.error('Usage: holistic-review-repair.tsx <state.json> <brief.md> <out-dir>')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const briefPath = resolve(args[1])
  const outDir = resolve(args[2])
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const brief = readFileSync(briefPath, 'utf-8')
  const modules = state.moduleDecomposition?.modules ?? []
  console.error(`[holistic-review] modules: ${modules.length}`)

  // ─── Step 1: Review ─────────────────────────────────────────────────────
  const reviewResult = await review(modules, brief)
  console.error(`\n=== REVIEW SUMMARY ===`)
  console.error(reviewResult.summary)
  console.error(`\n=== ISSUES FOUND (${reviewResult.issues.length}) ===`)
  const bySev = { critical: 0, major: 0, minor: 0 }
  for (const i of reviewResult.issues) {
    bySev[i.severity] = (bySev[i.severity] ?? 0) + 1
    console.error(`[${i.severity.toUpperCase()} / ${i.module} / ${i.kind}] ${i.description}`)
    console.error(`  → ${i.suggested_fix}`)
  }
  console.error(`Counts: critical=${bySev.critical}, major=${bySev.major}, minor=${bySev.minor}`)
  writeFileSync(resolve(outDir, 'review.json'), JSON.stringify(reviewResult, null, 2))

  // ─── Step 2: Repair critical + major (skip minor) ────────────────────────
  const toFix = reviewResult.issues.filter(i => i.severity === 'critical' || i.severity === 'major')
  let finalModules = modules
  if (toFix.length > 0) {
    console.error(`\n[holistic-review] auto-repairing ${toFix.length} critical/major issues (${reviewResult.issues.length - toFix.length} minor left for human review)...`)
    finalModules = await repair(modules, toFix, brief)
    writeFileSync(resolve(outDir, 'modules-after-repair.json'), JSON.stringify({ modules: finalModules }, null, 2))

    // ─── Step 3: Re-review to confirm fixes ─────────────────────────────────
    console.error(`\n[holistic-review] re-reviewing after repair...`)
    const reReview = await review(finalModules, brief)
    console.error(`\n=== AFTER-REPAIR REVIEW ===`)
    console.error(reReview.summary)
    const rSev = { critical: 0, major: 0, minor: 0 }
    for (const i of reReview.issues) {
      rSev[i.severity] = (rSev[i.severity] ?? 0) + 1
      console.error(`[${i.severity.toUpperCase()} / ${i.module} / ${i.kind}] ${i.description}`)
    }
    console.error(`After-repair counts: critical=${rSev.critical}, major=${rSev.major}, minor=${rSev.minor}`)
    console.error(`Δ resolved: ${reviewResult.issues.length - reReview.issues.length}`)
    writeFileSync(resolve(outDir, 'review-after.json'), JSON.stringify(reReview, null, 2))
  } else {
    console.error('\n[holistic-review] no critical or major issues — design is coherent. No repair needed.')
  }

  // ─── Step 4: Save corrected state, rebuild NL layer, render ─────────────
  const correctedState = {
    ...state,
    moduleDecomposition: {
      ...state.moduleDecomposition,
      modules: finalModules,
    },
    savedAt: new Date().toISOString(),
  }
  try {
    const { buildNaturalLanguageLayer } = await import('../src/lib/pdf-engine-v2/radical/sentence-generator')
    correctedState.naturalLanguageLayer = buildNaturalLanguageLayer(finalModules as any)
    for (const m of finalModules as any[]) {
      const nl = correctedState.naturalLanguageLayer.by_module[m.module]
      if (nl && m.overview_paragraph_en) (nl as any).paragraph_en_llm = m.overview_paragraph_en
    }
  } catch {}

  const finalStatePath = resolve(outDir, 'state-final.json')
  writeFileSync(finalStatePath, JSON.stringify(correctedState, null, 2))
  console.error(`\n[holistic-review] state → ${finalStatePath}`)

  const pdfPath = resolve(outDir, 'final.pdf')
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), finalStatePath, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  })
  execFileSync('open', [pdfPath])
  console.error(`[holistic-review] opened ${pdfPath}`)
}

main().catch(err => {
  console.error('[holistic-review] FATAL:', err)
  process.exit(1)
})
