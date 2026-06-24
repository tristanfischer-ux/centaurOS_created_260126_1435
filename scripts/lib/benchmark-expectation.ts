/**
 * benchmark-expectation.ts — the GENERATIVE SANITY NET (Tristan 2026-06-24).
 *
 * The deterministic engine can be confidently, obviously wrong — a 3 MWh BESS priced at £2,963/kWh,
 * a £62k pH probe — and no per-class deterministic gate catches it, because the magnitude is plausible
 * for SOME class. The fix Tristan specified: ask an LLM, independently, what a system like THIS should
 * be — the benchmark a knowledgeable engineer gives off the top of their head: expected cost, expected
 * electrical/performance output, and the expected bill of materials — then DIFF the deterministic engine
 * against it. A radical divergence on ANY dimension is flagged automatically and triggers a "full check".
 *
 * It is a NET, not a judge: it never decides who is right. It raises the alarm so the wrong one (the
 * generative LLM or the deterministic engine) gets verified. UNIVERSAL by construction: the LLM needs
 * no pre-loaded cost band, so it works on any/unseen archetype — unlike gate 32's hardcoded
 * INDUSTRY_COST_BANDS, which silently skip classes nobody pre-loaded.
 *
 * INDEPENDENCE PRINCIPLE (Tristan 2026-06-24, the load-bearing design decision): the benchmark is
 * only a valid check if it FAILS DIFFERENTLY from the thing it checks. The deterministic engine is
 * BOTTOM-UP — it sums per-part prices (catalogue × qty); its errors are arithmetic/pricing bugs (a
 * busbar at £452 × 3,735, a 350 m³ volume, a wrong floor). The benchmark is forced to be TOP-DOWN —
 * a market-anchored gestalt ("a real 3 MWh battery sells for ~£300/kWh → ~£0.9M") that, by method,
 * CANNOT contain the busbar arithmetic bug because it never sums busbars. The prompt explicitly
 * FORBIDS bottom-up itemise-and-add; if it didn't, the benchmark would reproduce the engine's method
 * (and its errors) and the check would be circular and worthless. Top-down vs bottom-up is the
 * independence; the divergence between them is the signal.
 *
 * Usage:
 *   npx tsx scripts/lib/benchmark-expectation.ts <out-dir>     # generate + compare + print the full check
 *   npx tsx scripts/lib/benchmark-expectation.ts --selftest    # pure comparison logic
 */
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { homedir } from 'os'

// ── env (same places the chain reads) ──────────────────────────────────────────
for (const p of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
]) {
  try {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
}
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''
const BENCHMARK_MODEL = process.env.BENCHMARK_MODEL || 'z-ai/glm-5.2'  // most capable model in the stack (Tristan 2026-06-24)
// The diagnose step (a fault-extraction over a big line-item list) is latency-sensitive and doesn't
// need the deepest reasoning — a faster model avoids the GLM-5.2 reasoning-token timeout squeeze.
const DIAGNOSE_MODEL = process.env.DIAGNOSE_MODEL || 'x-ai/grok-4.3'
// How far the deterministic number may stray from the LLM benchmark before we flag.
const WARN_FACTOR = Number(process.env.BENCHMARK_WARN_FACTOR || 1.5)     // [1.5,2.5)× → WARN
const RADICAL_FACTOR = Number(process.env.BENCHMARK_RADICAL_FACTOR || 2.5) // ≥2.5× (or ≤1/2.5) → RADICAL → full check

// ── types ───────────────────────────────────────────────────────────────────
export interface BenchmarkExpectation {
  expected_cost: { low_gbp: number; expected_gbp: number; high_gbp: number; per_output_unit: string; basis: string }
  expected_outputs: Array<{ metric: string; value: number; unit: string }>
  expected_bom: Array<{ item: string; typical_pct_of_cost: number; note?: string }>
  // SIZING realism (Tristan 2026-06-24): the physical envelope a real one occupies. The "you asked
  // for a 40-ft container but the GA is a massive space" alarm + the "single component bigger than
  // the whole enclosure" catch (the busbar at 350 m³ in an 86 m³ container).
  expected_sizing: { footprint_m2: number; volume_m3: number; envelope: string; basis: string }
  // COMPONENT completeness: the major components a real one MUST have. A missing one → flag + investigate.
  required_components: string[]
  reasoning: string
  model: string
}
export type Verdict = 'ok' | 'warn' | 'radical'
export interface DivergenceFinding {
  dimension: string
  expected: string
  deterministic: string
  ratio: number | null
  verdict: Verdict
  note: string
}
export interface DivergenceReport {
  findings: DivergenceFinding[]
  worst: Verdict
  needs_full_check: boolean
  summary: string
}

// ── deterministic readers (the engine's own numbers) ───────────────────────────
export function deterministicHeadlineCostGbp(state: any): { gbp: number; source: string } | null {
  const cs = state?.costStack || {}
  for (const [k, src] of [['oem_transfer_price_gbp', 'costStack.oem_transfer_price_gbp'],
                          ['installed_asp_gbp', 'costStack.installed_asp_gbp']] as const) {
    if (typeof cs[k] === 'number' && cs[k] > 0) return { gbp: cs[k], source: src }
  }
  const cr = state?.cost_reality?.bom_total_gbp
  if (typeof cr === 'number' && cr > 0) return { gbp: cr, source: 'cost_reality.bom_total_gbp' }
  const rb = state?.requirementsBom
  if (Array.isArray(rb)) {
    const s = rb.reduce((a: number, b: any) => a + (b?.line_gbp || 0), 0)
    if (s > 0) return { gbp: s, source: 'Σ requirementsBom.line_gbp' }
  }
  return null
}

/** A compact brief description for the LLM, built from the parsed brief. */
export function briefDescriptionFromState(state: any): string {
  const pb = state?.parsedBrief || {}
  const c = pb.constraints || {}
  const tp = c.target_performance || {}
  const cls = state?.orchestratorContract?.product_class || pb.product_class || 'engineered system'
  const lines: string[] = [`Product class: ${cls}`]
  if (pb.summary) lines.push(`Summary: ${String(pb.summary).slice(0, 600)}`)
  if (tp.value != null) lines.push(`Headline target: ${tp.value} ${tp.unit || ''} (${tp.key_metric || 'output'})`)
  for (const m of (tp.metrics || []).slice(0, 10)) lines.push(`  - ${m.key_metric || m.key}: ${m.value} ${m.unit || ''}`)
  if (c.unit_cost_ceiling?.value) lines.push(`Stated cost ceiling: ${c.unit_cost_ceiling.value} ${c.unit_cost_ceiling.unit || 'GBP'}`)
  return lines.join('\n')
}

// ── the generative benchmark (LLM) ─────────────────────────────────────────────
export async function generateBenchmarkExpectation(briefDescription: string): Promise<BenchmarkExpectation | null> {
  if (!OPENROUTER_KEY) { console.error('[benchmark] no OPENROUTER_API_KEY — cannot generate benchmark'); return null }
  const prompt =
    `You are a senior cost & systems engineer giving a fast, independent SANITY benchmark for a piece of ` +
    `industrial hardware — the kind of off-the-top-of-your-head estimate you would give if asked "roughly ` +
    `what should one of these cost, output, and be built from?".\n\n` +
    `CRITICAL — this must be a TOP-DOWN, MARKET-ANCHORED estimate, NOT a bottom-up build-up. Anchor to ` +
    `what a REAL one of these ACTUALLY SELLS FOR or costs to build, from your knowledge of shipped products ` +
    `and real projects (e.g. "utility battery storage runs ~£250-400/kWh installed → a 3 MWh system ≈ ` +
    `£0.9-1.2M"). Do NOT itemise components and add them up — that is the exact method the system being ` +
    `checked already uses, so reproducing it would make this a useless circular check. Give the gestalt ` +
    `figure a market analyst would quote, then express the bill of materials only as the rough PERCENTAGE ` +
    `MIX a real one has (so we can spot when a deterministic build-up lets one line dominate the bill).\n\n` +
    `SYSTEM:\n${briefDescription}\n\n` +
    `Return ONLY JSON, no commentary:\n` +
    `{\n` +
    `  "expected_cost": { "low_gbp": <number>, "expected_gbp": <number>, "high_gbp": <number>, "per_output_unit": "<e.g. £/kWh, £/kW, £/t·yr>", "basis": "<one sentence: how you arrived at this>" },\n` +
    `  "expected_outputs": [ { "metric": "<name>", "value": <number>, "unit": "<unit>" } ],\n` +
    `  "expected_bom": [ { "item": "<major component/category>", "typical_pct_of_cost": <number 0-100>, "note": "<optional>" } ],\n` +
    `  "expected_sizing": { "footprint_m2": <number>, "volume_m3": <number>, "envelope": "<e.g. one 40-ft ISO container ≈ 30 m² / 86 m³>", "basis": "<one sentence>" },\n` +
    `  "required_components": [ "<major component a real one MUST have, e.g. power conversion system>", "..." ],\n` +
    `  "reasoning": "<2-3 sentences of how a real one of these is costed/sized and what dominates the bill of materials>"\n` +
    `}\n` +
    `Be realistic and specific. expected_bom percentages = where the money REALLY goes. expected_sizing = the ` +
    `PHYSICAL envelope a real one occupies (if the brief states a container/enclosure, size to it — a single ` +
    `component can never be larger than the whole enclosure). required_components = the handful of major ` +
    `subsystems whose ABSENCE would mean the design is incomplete.`
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS benchmark sanity net',
      },
      // reasoning model (GLM-5.2) — give room to think before the JSON, or the completion comes back empty
      body: JSON.stringify({ model: BENCHMARK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 6000 }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) { console.error(`[benchmark] LLM HTTP ${res.status}`); return null }
    const j: any = await res.json()
    let raw = j?.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string') return null
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) raw = fence[1]
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
    if (a === -1 || b === -1) return null
    const p = JSON.parse(raw.slice(a, b + 1))
    if (!p.expected_cost || typeof p.expected_cost.expected_gbp !== 'number') return null
    return { ...p, model: BENCHMARK_MODEL } as BenchmarkExpectation
  } catch (e) {
    console.error(`[benchmark] generation failed: ${(e as Error).message}`)
    return null
  }
}

// ── the comparison (PURE — testable without an LLM) ────────────────────────────
function classify(ratio: number): Verdict {
  const r = ratio >= 1 ? ratio : 1 / ratio
  if (r >= RADICAL_FACTOR) return 'radical'
  if (r >= WARN_FACTOR) return 'warn'
  return 'ok'
}
const worstOf = (vs: Verdict[]): Verdict =>
  vs.includes('radical') ? 'radical' : vs.includes('warn') ? 'warn' : 'ok'

export function compareToBenchmark(exp: BenchmarkExpectation, state: any): DivergenceReport {
  const findings: DivergenceFinding[] = []

  // 1) COST — the headline check.
  const det = deterministicHeadlineCostGbp(state)
  if (det && exp.expected_cost?.expected_gbp > 0) {
    const e = exp.expected_cost
    const ratio = det.gbp / e.expected_gbp
    // verdict against the ENVELOPE: ok if within [low,high]; else scaled by how far past the edge.
    let verdict: Verdict = 'ok'
    if (det.gbp < e.low_gbp) verdict = classify(e.low_gbp / det.gbp)
    else if (det.gbp > e.high_gbp) verdict = classify(det.gbp / e.high_gbp)
    findings.push({
      dimension: 'all-in cost',
      expected: `£${Math.round(e.low_gbp).toLocaleString()}–${Math.round(e.high_gbp).toLocaleString()} (mid £${Math.round(e.expected_gbp).toLocaleString()})`,
      deterministic: `£${Math.round(det.gbp).toLocaleString()} (${det.source})`,
      ratio: Number(ratio.toFixed(2)),
      verdict,
      note: verdict === 'ok' ? 'within the benchmark envelope' : `${ratio.toFixed(1)}× the LLM mid-estimate — ${e.basis || ''}`,
    })
  }

  // 2) OUTPUT — does the design deliver the expected performance?
  const km = state?.keyMetrics || {}
  const ho = km.headline_output || {}
  const detVal = Number(ho.value)
  if (Number.isFinite(detVal) && detVal > 0) {
    const match = (exp.expected_outputs || []).find(o =>
      (o.unit || '').toLowerCase().replace(/\s/g, '') === String(ho.unit || '').toLowerCase().replace(/\s/g, ''))
    if (match && match.value > 0) {
      const ratio = detVal / match.value
      findings.push({
        dimension: `output (${ho.unit || ''})`,
        expected: `${match.value} ${match.unit}`,
        deterministic: `${detVal} ${ho.unit || ''}`,
        ratio: Number(ratio.toFixed(2)),
        verdict: classify(ratio),
        note: classify(ratio) === 'ok' ? 'output matches expectation' : 'design output diverges from the benchmark',
      })
    }
  }

  // 3) BoM MIX — does a category dominate the bill far more than a real one of these would?
  const rb: any[] = Array.isArray(state?.requirementsBom) ? state.requirementsBom : []
  const total = rb.reduce((a, b) => a + (b?.line_gbp || 0), 0)
  if (total > 0 && Array.isArray(exp.expected_bom) && exp.expected_bom.length) {
    // top deterministic line as a fraction of the bill
    const top = rb.slice().sort((a, b) => (b?.line_gbp || 0) - (a?.line_gbp || 0))[0]
    if (top) {
      const topPct = 100 * (top.line_gbp || 0) / total
      const topName = String(top.requirement || top.tag || 'top line').toLowerCase()
      // the highest single category a real one of these should reach
      const maxExpectedPct = Math.max(...exp.expected_bom.map(x => x.typical_pct_of_cost || 0))
      // flag when one line alone exceeds the largest category a real BoM would have, by the factor
      const ratio = maxExpectedPct > 0 ? topPct / maxExpectedPct : null
      if (ratio && ratio >= WARN_FACTOR) {
        findings.push({
          dimension: 'BoM concentration',
          expected: `no single category above ~${Math.round(maxExpectedPct)}% of cost`,
          deterministic: `"${(top.requirement || top.tag || '').toString().slice(0, 36)}" is ${topPct.toFixed(0)}% of the bill`,
          ratio: Number(ratio.toFixed(2)),
          verdict: classify(ratio),
          note: 'one line dominates the bill far more than a real one of these would — likely an over-priced or over-counted commodity',
        })
      }
    }
  }

  // 4) SIZING realism — does the physical envelope match, and is any single component larger than the
  // whole enclosure? (the busbar at 350 m³ in an 86 m³ container; the GA that is a "massive space").
  const env = exp.expected_sizing?.volume_m3
  if (typeof env === 'number' && env > 0) {
    // component volumes parsed from BoM requirement strings ("· 350 m³") + any contract volume keys
    const vols: Array<{ name: string; m3: number }> = []
    for (const b of rb) {
      // tolerate "350 m³" (unicode) and "350 m3" (ascii); no \b after ³ (it is a non-word char)
      const m = String(b?.requirement || '').match(/·\s*([\d,]+(?:\.\d+)?)\s*m(?:³|3)(?!\d)/)
      if (m) vols.push({ name: String(b.requirement).split('·')[0].trim(), m3: parseFloat(m[1].replace(/,/g, '')) })
    }
    const biggest = vols.slice().sort((a, c) => c.m3 - a.m3)[0]
    if (biggest && biggest.m3 > env) {
      // a single component bigger than the stated enclosure is an unambiguous sizing error
      findings.push({
        dimension: 'sizing — single component vs enclosure',
        expected: `≤ the ${exp.expected_sizing.envelope || 'enclosure'} (~${Math.round(env)} m³ total)`,
        deterministic: `"${biggest.name.slice(0, 32)}" alone is ${biggest.m3.toLocaleString()} m³`,
        ratio: Number((biggest.m3 / env).toFixed(2)),
        verdict: 'radical',
        note: 'a single component is larger than the entire stated enclosure — a volume/units bug (this also breaks the GA layout)',
      })
    }
    const sumV = vols.reduce((a, v) => a + v.m3, 0)
    if (sumV > 0) {
      const ratio = sumV / env
      if (ratio >= WARN_FACTOR) {
        findings.push({
          dimension: 'sizing — total equipment volume',
          expected: `fits ${exp.expected_sizing.envelope || 'the enclosure'} (~${Math.round(env)} m³)`,
          deterministic: `equipment sums to ~${Math.round(sumV).toLocaleString()} m³`,
          ratio: Number(ratio.toFixed(2)),
          verdict: classify(ratio),
          note: 'the equipment does not fit the stated enclosure — the GA drawing will sprawl beyond the container',
        })
      }
    }
  }

  // 5) COMPONENT completeness — required_components is carried for the LLM diagnose step to judge
  // against the ACTUAL bill. Naive keyword matching is too brittle (it false-flags "battery racks"
  // missing when the cells ship as "cell-to-cell busbar" / "module steel frame", and false-passes
  // "battery management system" on the generic token "system"). Presence is a fuzzy judgement, so the
  // LLM (which understands that a cell busbar implies cells) assesses it in diagnoseFaults().

  const worst = worstOf(findings.map(f => f.verdict))
  const needs_full_check = worst === 'radical'
  const summary = !findings.length
    ? 'no comparable dimensions (missing benchmark or deterministic numbers)'
    : worst === 'ok' ? 'deterministic output is within the LLM benchmark on every checked dimension'
    : worst === 'warn' ? 'deterministic output deviates from the benchmark — review recommended'
    : 'RADICAL divergence — the deterministic engine and the LLM benchmark disagree by >2.5× on a core dimension; one of them is wrong. FULL CHECK REQUIRED.'
  return { findings, worst, needs_full_check, summary }
}

// ── auto-diagnose (the LLM steps INTO the deterministic numbers and names the fault) ───────────
export interface Fault {
  line: string; dimension: string; issue: string; magnitude: string; suggested: string; likely_cause: string
}
export async function diagnoseFaults(exp: BenchmarkExpectation, state: any, report: DivergenceReport): Promise<Fault[]> {
  if (!OPENROUTER_KEY) return []
  const rb: any[] = Array.isArray(state?.requirementsBom) ? state.requirementsBom : []
  const total = rb.reduce((a, b) => a + (b?.line_gbp || 0), 0) || 1
  // EVERY MATERIAL LINE (Tristan 2026-06-24: "look at every single line and every single spec").
  // The diagnose used to see only the top 25 by cost — a wrong line at #40 slipped it. Now it
  // sees every priced line (a tiny £-share line can still be a per-UNIT spec error: a £59 tap
  // wire × 3,750). Sorted by line cost; capped at 150 so the prompt stays bounded, with an
  // explicit note when the tail is truncated so a silent cap never reads as "all lines checked".
  const priced = rb.filter(b => (b?.line_gbp || 0) > 0).sort((a, b) => (b?.line_gbp || 0) - (a?.line_gbp || 0))
  const LINE_CAP = 150
  const shown = priced.slice(0, LINE_CAP)
  const truncatedNote = priced.length > LINE_CAP
    ? `\n(NOTE: ${priced.length - LINE_CAP} further lines below £${Math.round(shown[shown.length - 1]?.line_gbp || 0)} not shown — flag the cap if a tail line looks suspect.)` : ''
  const lines = shown.map(b =>
    `${b.tag || '—'} | qty ${b.qty} | unit £${b.unit_gbp} | line £${Math.round(b.line_gbp || 0)} (${(100 * (b.line_gbp || 0) / total).toFixed(1)}%) | ${(b.requirement || '').toString().slice(0, 64)}`)
  const flagged = report.findings.filter(f => f.verdict !== 'ok')
    .map(f => `- ${f.dimension}: expected ${f.expected}; engine gave ${f.deterministic} (${f.verdict})`)
  const perUnit = exp.expected_cost?.per_output_unit || ''
  const prompt =
    `You are auditing a deterministic engineering bill of materials that DIVERGED from a realistic ` +
    `benchmark. Go line by line through EVERY item below and name the SPECIFIC lines at fault, so an ` +
    `engineer can fix them. Check BOTH the line total AND the per-UNIT price for plausibility for that ` +
    `specific item (a £59 cell tap wire or a £120 cell busbar is a per-unit error even at a small bill ` +
    `share). Be concrete (which line, how far off, the likely cause: wrong unit price / wrong quantity / ` +
    `wrong size-or-volume / mis-classified commodity / a per-cell commodity carrying a reel-or-sheet ` +
    `price / missing component).\n\n` +
    `BENCHMARK said: total cost ~£${Math.round(exp.expected_cost.expected_gbp).toLocaleString()} ` +
    `(${perUnit ? `~${perUnit}` : ''}); sizing ${exp.expected_sizing?.envelope || '—'}; ` +
    `BoM mix ${(exp.expected_bom || []).map(x => `${x.item} ~${x.typical_pct_of_cost}%`).join(', ')}.\n\n` +
    `REQUIRED COMPONENTS a real one MUST have: ${(exp.required_components || []).join(', ')}. Check the bill ` +
    `below and report any genuinely ABSENT one as a fault with dimension "component" — but DO NOT false-flag: ` +
    `a component is present even if named differently (e.g. cells ship as "cell-to-cell busbar"/"module frame"; ` +
    `a PCS may appear as "inverter"). Only flag a subsystem that truly has no representation in the bill.\n\n` +
    `FLAGGED DIVERGENCES:\n${flagged.join('\n')}\n\n` +
    `EVERY DETERMINISTIC LINE ITEM (tag | qty | unit £ | line £ (% of bill) | description):\n${lines.join('\n')}${truncatedNote}\n\n` +
    `Return ONLY JSON: { "faults": [ { "line": "<tag or name>", "dimension": "cost|sizing|quantity|component", ` +
    `"issue": "<what's wrong>", "magnitude": "<e.g. ~90× too high>", "suggested": "<realistic value>", ` +
    `"likely_cause": "<root cause>" } ] }. List EVERY genuine fault you find (per-line, not just the biggest), worst first.`
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'ForgeOS fault diagnosis' },
      body: JSON.stringify({ model: DIAGNOSE_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 8000 }),
      signal: AbortSignal.timeout(240_000),
    })
    if (!res.ok) { console.error(`[benchmark] diagnose HTTP ${res.status}`); return [] }
    const j: any = await res.json()
    let raw = j?.choices?.[0]?.message?.content
    if (!raw || typeof raw !== 'string') { console.error('[benchmark] diagnose: empty completion'); return [] }
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) raw = fence[1]
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
    if (a === -1 || b === -1) { console.error(`[benchmark] diagnose: no JSON in completion (${raw.slice(0, 80)}…)`); return [] }
    const p = JSON.parse(raw.slice(a, b + 1))
    return Array.isArray(p.faults) ? p.faults.slice(0, 40) : []
  } catch (e) { console.error(`[benchmark] diagnose failed: ${(e as Error).message}`); return [] }
}

// ── CLI ────────────────────────────────────────────────────────────────────
async function main() {
  const dir = process.argv[2]
  if (!dir) { console.error('Usage: benchmark-expectation.ts <out-dir>'); process.exit(1) }
  const statePath = join(resolve(dir), 'state.json')
  if (!existsSync(statePath)) { console.error(`no state.json in ${dir}`); process.exit(1) }
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  const desc = briefDescriptionFromState(state)
  console.error(`[benchmark] generating expectation via ${BENCHMARK_MODEL}…`)
  const exp = await generateBenchmarkExpectation(desc)
  if (!exp) { console.error('[benchmark] could not generate — aborting'); process.exit(2) }
  const report = compareToBenchmark(exp, state)
  // auto-diagnose: when anything flagged, have the LLM step into the numbers and name the faults
  const faults = report.findings.some(f => f.verdict !== 'ok') ? await diagnoseFaults(exp, state, report) : []
  const out = { expectation: exp, report, faults, generated_for: dir }
  writeFileSync(join(resolve(dir), 'benchmark-expectation.json'), JSON.stringify(out, null, 2))

  // ── the "full check" print ──
  const bar = (v: Verdict) => v === 'radical' ? '🔴 RADICAL' : v === 'warn' ? '🟠 WARN' : '🟢 OK'
  console.log('\n══════════ GENERATIVE BENCHMARK — FULL CHECK ══════════')
  console.log(`LLM expectation (${exp.model}): ${exp.reasoning}\n`)
  for (const f of report.findings) {
    console.log(`${bar(f.verdict)}  ${f.dimension}`)
    console.log(`     expected (LLM):   ${f.expected}`)
    console.log(`     deterministic:    ${f.deterministic}   [ratio ${f.ratio ?? '—'}]`)
    console.log(`     ${f.note}`)
  }
  if (faults.length) {
    console.log('\n── AUTO-DIAGNOSIS (the LLM, stepping into the deterministic line items) ──')
    for (const f of faults) {
      console.log(`  • ${f.line} [${f.dimension}] — ${f.issue} (${f.magnitude})`)
      console.log(`      → suggested: ${f.suggested}  ·  likely cause: ${f.likely_cause}`)
    }
  }
  console.log(`\nVERDICT: ${bar(report.worst)} — ${report.summary}`)
  if (report.needs_full_check) {
    console.log('⚠ A radical divergence was flagged. Verify which side is wrong BEFORE shipping this dossier.')
  }
  console.log('═══════════════════════════════════════════════════════\n')
  process.exit(report.needs_full_check ? 3 : 0)
}

// ── selftest (pure comparison) ─────────────────────────────────────────────
function _selftest() {
  let bad = 0
  const exp: BenchmarkExpectation = {
    expected_cost: { low_gbp: 750_000, expected_gbp: 1_000_000, high_gbp: 1_300_000, per_output_unit: '£/kWh', basis: '~£300/kWh × 3 MWh' },
    expected_outputs: [{ metric: 'nameplate', value: 3, unit: 'MWh' }],
    expected_bom: [{ item: 'battery cells', typical_pct_of_cost: 55 }, { item: 'PCS', typical_pct_of_cost: 15 }],
    expected_sizing: { footprint_m2: 30, volume_m3: 86, envelope: 'one 40-ft ISO container', basis: '40-ft container' },
    required_components: ['power conversion system', 'step-up transformer', 'battery management system'],
    reasoning: 'cells dominate', model: 'test',
  }
  // RADICAL cost (the real BESS: £8.9M OEM vs £1.3M high → ~6.8×)
  const r1 = compareToBenchmark(exp, { costStack: { oem_transfer_price_gbp: 8_900_000 }, keyMetrics: {}, requirementsBom: [] })
  if (r1.worst !== 'radical' || !r1.needs_full_check) { console.log('FAIL: £8.9M vs £1.3M high should be RADICAL'); bad++ }
  // OK cost (within envelope)
  const r2 = compareToBenchmark(exp, { costStack: { oem_transfer_price_gbp: 1_050_000 }, keyMetrics: {}, requirementsBom: [] })
  const costF = r2.findings.find(f => f.dimension === 'all-in cost')
  if (!costF || costF.verdict !== 'ok') { console.log('FAIL: £1.05M within envelope should be OK'); bad++ }
  // BoM concentration: one line 60% when max expected 55% → ratio 1.09 → ok; one line 90% → 1.6× → warn+
  const r3 = compareToBenchmark(exp, {
    costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {},
    requirementsBom: [{ requirement: 'cell-to-cell busbar', line_gbp: 900 }, { requirement: 'rest', line_gbp: 100 }],
  })
  const bomF = r3.findings.find(f => f.dimension === 'BoM concentration')
  if (!bomF || bomF.verdict === 'ok') { console.log('FAIL: a 90%-of-bill busbar line should flag BoM concentration'); bad++ }
  // SIZING: a single 350 m³ component in an 86 m³ envelope → radical sizing flag
  const r4 = compareToBenchmark(exp, {
    costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {},
    requirementsBom: [{ requirement: 'cell-to-cell busbar · 350 m³', line_gbp: 1000 }],
  })
  const sizeF = r4.findings.find(f => f.dimension.startsWith('sizing — single'))
  if (!sizeF || sizeF.verdict !== 'radical') { console.log('FAIL: a 350 m³ component in an 86 m³ enclosure should be RADICAL sizing'); bad++ }
  // (component-completeness is LLM-judged in diagnoseFaults — not a deterministic finding — so no pure case here)
  // classify boundaries
  if (classify(2.6) !== 'radical' || classify(1.8) !== 'warn' || classify(1.2) !== 'ok' || classify(1 / 2.6) !== 'radical') {
    console.log('FAIL: classify boundaries'); bad++
  }
  console.log(bad === 0 ? 'benchmark-expectation selftest: OK' : `benchmark-expectation selftest: ${bad} FAIL`)
  if (bad) process.exit(1)
}

if (process.argv.includes('--selftest')) _selftest()
else if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
