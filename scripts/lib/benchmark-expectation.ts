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
// Tristan 2026-06-25: tighten the ACTIONABLE tolerance — a >20% delta on any line/output is a
// warning the engine has to do something about (route to source rule + fix), not a pass. WARN at
// 1.2× routes; RADICAL at 2.5× additionally trips the full diagnose + (enforcing) hard block.
const WARN_FACTOR = Number(process.env.BENCHMARK_WARN_FACTOR || 1.2)     // >20% delta → WARN (actionable → routed)
const RADICAL_FACTOR = Number(process.env.BENCHMARK_RADICAL_FACTOR || 2.5) // ≥2.5× (or ≤1/2.5) → RADICAL → full check + block

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

// Canonicalise a (value, unit) into a comparable base by UNIT FAMILY, so the net can diff a
// predicted "5000 kWh" against an engine "2.91 MWh" with no exact unit-string match. Returns the
// value in the family base (energy→kWh, power→kW, voltage→V, current→A, percent→%, mass→kg) +
// the family tag; null when the value is not finite.
export function canonicalMeasure(value: number, unit: string): { v: number; family: string } | null {
  const v = Number(value)
  if (!Number.isFinite(v)) return null
  // superscript normalisation (gate-36 round 2): 'm³/h' ≡ 'm3/h' — unknown units compare by
  // their RAW string as the family, so the unicode/ascii split silently excluded a matching
  // quantity (the demand-coverage delivered totals are minted ascii; the LLM predicts unicode).
  const u = String(unit || '').toLowerCase().replace(/\s/g, '').replace(/³/g, '3').replace(/²/g, '2')
  if (/^wh$/.test(u)) return { v: v / 1000, family: 'energy' }
  if (/^kwh$/.test(u)) return { v, family: 'energy' }
  if (/^mwh$/.test(u)) return { v: v * 1000, family: 'energy' }
  if (/^gwh$/.test(u)) return { v: v * 1e6, family: 'energy' }
  if (/^w$/.test(u)) return { v: v / 1000, family: 'power' }
  if (/^kw$/.test(u)) return { v, family: 'power' }
  if (/^mw$/.test(u)) return { v: v * 1000, family: 'power' }
  if (/^gw$/.test(u)) return { v: v * 1e6, family: 'power' }
  if (/^mv$/.test(u)) return { v: v / 1000, family: 'voltage' }
  if (/^v$/.test(u)) return { v, family: 'voltage' }
  if (/^kv$/.test(u)) return { v: v * 1000, family: 'voltage' }
  if (/^ma$/.test(u)) return { v: v / 1000, family: 'current' }
  if (/^a$/.test(u)) return { v, family: 'current' }
  if (/^ka$/.test(u)) return { v: v * 1000, family: 'current' }
  if (/^%$|^percent$|^pct$/.test(u)) return { v, family: 'percent' }
  if (/^ratio$|^fraction$/.test(u) || (u === '' && v > 0 && v <= 1)) return { v: v * 100, family: 'percent' }
  if (/^cycles?$|^count$|^ea$|^units?$/.test(u) || u === '') return { v, family: 'count' }
  if (/^m2$|^m²$|^sqm$/.test(u)) return { v, family: 'area' }
  if (/^m3$|^m³$/.test(u)) return { v, family: 'volume' }
  if (/^kg$/.test(u)) return { v, family: 'mass' }
  if (/^t$|^tonne$|^tonnes$/.test(u)) return { v: v * 1000, family: 'mass' }
  return { v, family: u }   // unknown unit — only compares against the SAME raw unit
}

// ── BRIEF-PINNED VOLUMES (2026-07-02, the v56 40 m³ tank false-fault) ──────────
// A quantity/dimension the BRIEF itself mandates (e.g. "one 40 m³ fresh-water tank plus two
// 40 m³ drain tanks" → total_water_storage_volume_m3 = 120) is NOT an engine sizing fault —
// the engine is DELIVERING the brief. The net must diff the engine against the benchmark on
// the RESIDUAL (non-pinned) volume, and a per-line fault that targets a pinned item must
// downgrade to an informational note ("brief-mandated; benchmark envelope assumes X").
// Detection is deterministic: walk parsedBrief.constraints (derived_requirements +
// target_performance.metrics) for VOLUME-family entries (unit m³ — a rate like m³/h never
// canonicalises to 'volume') whose key/label reads as a storage/tank/volume metric, and
// parse the per-item volumes from the entry's basis ("(40 m3)" / "(40 m3 each)").
export interface BriefPinnedVolume { key: string; label: string; m3: number; item_m3: number[]; basis: string }
export function briefPinnedVolumesM3(state: any): { total_m3: number; pins: BriefPinnedVolume[] } {
  const c = state?.parsedBrief?.constraints || {}
  const entries: any[] = [
    ...(Array.isArray(c.derived_requirements) ? c.derived_requirements : []),
    ...(Array.isArray(c.target_performance?.metrics) ? c.target_performance.metrics : []),
  ]
  const pins: BriefPinnedVolume[] = []
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    const cm = canonicalMeasure(Number(e.value), String(e.unit || ''))
    if (!cm || cm.family !== 'volume' || !(cm.v > 0)) continue     // 'm3/h' is NOT volume family
    const name = `${e.key || e.key_metric || ''} ${e.label || ''}`
    if (!/storage|tank|volume|vessel|buffer|capacity/i.test(name)) continue
    const basis = String(e.basis || '')
    const item_m3: number[] = []
    for (const m of basis.matchAll(/(\d+(?:\.\d+)?)\s*m(?:³|3)(?!\s*\/)(?!\d)/g)) item_m3.push(parseFloat(m[1]))
    pins.push({ key: String(e.key || e.key_metric || ''), label: String(e.label || ''),
                m3: cm.v, item_m3: item_m3.length ? item_m3 : [cm.v], basis })
  }
  return { total_m3: pins.reduce((a, p) => a + p.m3, 0), pins }
}

// Find the engine's actual value for a predicted output metric. (1) exact orchestrator-contract
// quantity key; else (2) same-unit-FAMILY + best name-token overlap (so 'rated_power_kw' finds
// 'continuous_power_kw'), de-prioritising peak/max; else (3) keyMetrics.headline_output when its
// family matches. Returns the canonical value + a raw display string + the source key.
export function engineValueForMetric(
  metric: string, wantUnit: string, quantities: Record<string, any>, headlineOutput: any
): { v: number; raw: string; source: string } | null {
  const wantFamily = canonicalMeasure(1, wantUnit)?.family
  const norm = (s: string) => String(s || '').toLowerCase()
  const stripUnit = (s: string) =>
    norm(s).replace(/_(kwh|mwh|gwh|wh|kw|mw|gw|w|kv|mv|v|ka|ma|a|percent|pct|cycles?|kg|t|m2|m3)$/g, '')
  const GENERIC = new Set(['rated', 'system', 'capacity', 'nominal', 'total', 'design', 'continuous', 'output', 'the', 'of', 'per', 'max'])
  const toks = (s: string) => new Set(stripUnit(s).split(/[_\s]+/).filter(t => t && !GENERIC.has(t)))

  const exact = quantities[metric]
  if (exact && Number.isFinite(Number(exact.value))) {
    const c = canonicalMeasure(Number(exact.value), exact.unit || wantUnit)
    if (c) return { v: c.v, raw: `${exact.value} ${exact.unit || wantUnit}`, source: `contract.${metric}` }
  }

  const wantToks = toks(metric)
  let best: { key: string; q: any; score: number } | null = null
  if (wantToks.size > 0) {
    for (const [key, q] of Object.entries(quantities)) {
      if (!q || !Number.isFinite(Number(q.value))) continue
      const c = canonicalMeasure(Number(q.value), q.unit || '')
      if (!c || (wantFamily && c.family !== wantFamily)) continue
      const kt = toks(key)
      let overlap = 0
      for (const t of wantToks) if (kt.has(t)) overlap++
      if (overlap === 0) continue
      // SCOPE PREFERENCE (gate-36 round 2 — the v56b storage 40-vs-120 false-RADICAL): when
      // several keys tie on token overlap, the diff must read the DELIVERED SYSTEM TOTAL,
      // never a per-scope/per-unit sibling. The tie used to fall to Object insertion order,
      // so the benchmark's 'storage' = 120 m³ matched fresh_water_storage_capacity_m3 = 40
      // (fresh-only) while water_storage_capacity_m3 = 120 + the delivered tank total sat
      // beside it; and 'fertigation_dosing_capacity' = 90 matched the PER-UNIT pump 45 (×2).
      // Honest-scoring doctrine: match the DELIVERED quantity. A `delivered` key (the
      // demand-coverage delivered-total convention) outranks a `total/overall` roll-up,
      // which outranks everything else; a per-share/per-unit key (`_per_…` / `_each_…`)
      // never takes the delivered bonus and is slightly de-prioritised, like peak/max.
      const nk = norm(key)
      const isPerShare = /(^|_)(per|each)(_|$)/.test(nk)
      const scopeBonus = isPerShare ? -0.25
        : /(^|_)delivered(_|$)/.test(nk) ? 0.5
        : /(^|_)(total|overall|aggregate|combined)(_|$)/.test(nk) ? 0.25 : 0
      const score = overlap + scopeBonus - (/peak|max|surge|inrush/.test(nk) ? 0.5 : 0)
      if (!best || score > best.score) best = { key, q, score }
    }
  }
  if (best) {
    const c = canonicalMeasure(Number(best.q.value), best.q.unit || wantUnit)!
    return { v: c.v, raw: `${best.q.value} ${best.q.unit || wantUnit}`, source: `contract.${best.key}` }
  }

  if (headlineOutput && Number.isFinite(Number(headlineOutput.value))) {
    const c = canonicalMeasure(Number(headlineOutput.value), headlineOutput.unit || '')
    if (c && (!wantFamily || c.family === wantFamily)) {
      return { v: c.v, raw: `${headlineOutput.value} ${headlineOutput.unit || ''}`, source: 'keyMetrics.headline_output' }
    }
  }
  return null
}

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

  // 2) OUTPUT — does the design deliver EVERY expected performance number?
  // (2026-06-25, Tristan "is the check actually working?") The old check diffed ONLY
  // keyMetrics.headline_output and matched it to a prediction by EXACT unit-string — so a BESS
  // whose headline is "850 MWh/year throughput" matched none of the predicted nameplate-kWh /
  // power-kW / voltage-V outputs, and the net diffed ZERO of the 6 outputs it predicted (a 5 MWh
  // brief silently shipped at 2.91 MWh / 1 MW). Now we diff EACH expected_output against the
  // engine's actual value for THAT metric — keyed to the orchestrator contract quantity by name +
  // UNIT-FAMILY (kWh↔MWh, kW↔MW, V↔kV, %↔ratio), with headline_output as a fallback.
  const qAll: Record<string, any> = (state?.orchestratorContract?.quantities) || {}
  const km = state?.keyMetrics || {}
  const ho = km.headline_output || {}
  for (const o of (exp.expected_outputs || [])) {
    if (!o || !(o.value > 0)) continue
    const want = canonicalMeasure(o.value, o.unit)
    if (!want) continue                       // family we can't canonicalise → skip (no false signal)
    const got = engineValueForMetric(o.metric, o.unit, qAll, ho)
    if (!got) continue                        // engine has no comparable quantity → skip
    const ratio = got.v / want.v
    const verdict = classify(ratio)
    findings.push({
      dimension: `output — ${o.metric}`,
      expected: `${o.value} ${o.unit}`,
      deterministic: `${got.raw} (${got.source})`,
      ratio: Number(ratio.toFixed(2)),
      verdict,
      note: verdict === 'ok'
        ? 'design meets the expected output'
        : `design ${o.metric} is ${ratio < 1 ? 'BELOW' : 'ABOVE'} the brief/benchmark expectation by ${(ratio >= 1 ? ratio : 1 / ratio).toFixed(2)}×`,
    })
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
      // tolerate "350 m³" (unicode) and "350 m3" (ascii); no \b after ³ (it is a non-word char).
      // RATE-UNIT GUARD (2026-07-02, the v56 2,031 m³ phantom): "45 m³/h" is a FLOW RATE, not a
      // volume — the old regex counted 59 pipe/pump duty ratings (2,031 "m³") as equipment volume
      // when the run's TRUE volume lines summed to zero. `(?!\s*\/)` rejects any m³/h·d·s rate.
      const m = String(b?.requirement || '').match(/·\s*([\d,]+(?:\.\d+)?)\s*m(?:³|3)(?!\d)(?!\s*\/)/)
      if (m) vols.push({ name: String(b.requirement).split('·')[0].trim(), m3: parseFloat(m[1].replace(/,/g, '')) })
    }
    // BRIEF-PINNED exemption (2026-07-02): a volume the brief itself mandates (the 3× 40 m³
    // tanks) is the engine DELIVERING the brief, not a sizing fault. Diff on the RESIDUAL.
    const pinned = briefPinnedVolumesM3(state)
    const maxPinnedItem = pinned.pins.reduce((a, p) => Math.max(a, ...p.item_m3), 0)
    const pinNote = pinned.total_m3 > 0
      ? `brief-mandated: ${Math.round(pinned.total_m3)} m³ pinned by the brief (${pinned.pins.map(p => p.label || p.key).join(', ')})`
      : ''
    const biggest = vols.slice().sort((a, c) => c.m3 - a.m3)[0]
    if (biggest && biggest.m3 > env) {
      // a single component bigger than the stated enclosure is an unambiguous sizing error —
      // UNLESS it is a brief-pinned item (then the benchmark envelope, not the engine, is short).
      const isPinnedItem = maxPinnedItem > 0 && biggest.m3 <= maxPinnedItem * 1.25
      findings.push({
        dimension: 'sizing — single component vs enclosure',
        expected: `≤ the ${exp.expected_sizing.envelope || 'enclosure'} (~${Math.round(env)} m³ total)`,
        deterministic: `"${biggest.name.slice(0, 32)}" alone is ${biggest.m3.toLocaleString()} m³`,
        ratio: Number((biggest.m3 / env).toFixed(2)),
        verdict: isPinnedItem ? 'ok' : 'radical',
        note: isPinnedItem
          ? `${pinNote}; benchmark envelope assumes ~${Math.round(env)} m³ — informational, not an engine fault`
          : 'a single component is larger than the entire stated enclosure — a volume/units bug (this also breaks the GA layout)',
      })
    }
    const sumV = vols.reduce((a, v) => a + v.m3, 0)
    if (sumV > 0) {
      const ratio = sumV / env
      if (ratio >= WARN_FACTOR) {
        // recompute on the residual EXCLUDING the brief-pinned volumes; a divergence the pins
        // explain downgrades to an informational note; still RADICAL on the residual → still blocks.
        const residual = Math.max(0, sumV - Math.min(pinned.total_m3, sumV))
        const resRatio = residual / env
        const verdict: Verdict = pinned.total_m3 > 0 ? classify(Math.max(resRatio, 1)) : classify(ratio)
        findings.push({
          dimension: 'sizing — total equipment volume',
          expected: `fits ${exp.expected_sizing.envelope || 'the enclosure'} (~${Math.round(env)} m³)`,
          deterministic: `equipment sums to ~${Math.round(sumV).toLocaleString()} m³`
            + (pinned.total_m3 > 0 ? ` (~${Math.round(residual).toLocaleString()} m³ excluding brief-pinned)` : ''),
          ratio: Number((pinned.total_m3 > 0 ? resRatio : ratio).toFixed(2)),
          verdict,
          note: verdict === 'ok'
            ? `${pinNote}; the residual ~${Math.round(residual)} m³ fits the benchmark envelope — informational, not an engine fault`
            : 'the equipment does not fit the stated enclosure — the GA drawing will sprawl beyond the container'
              + (pinNote ? ` (${pinNote}; residual still diverges)` : ''),
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

// ── SOURCE-RULE ROUTING (Tristan 2026-06-24: "fix the source, never the symptom") ───────────────
// A deterministic engine never slips — a wrong line is the product of a wrong RULE, so the fix is
// always to the RULE (universal, in code), never the data point. The engine already records WHICH
// rule priced/sized every line: the line's `basis` string is its provenance. This maps a basis to
// the exact source function so the punch-list routes each fault to the rule to fix — turning "find
// the source" from a hunt into a lookup. ORDER MATTERS: the most specific / most-likely-culprit
// rule first (a lift/floor/cap dominates a generic "catalogue"/"parametric" tail in the same basis).
export interface SourceRule { rule: string; file: string; fn: string; fix_hint: string }
const SOURCE_RULES: Array<{ re: RegExp; rule: SourceRule }> = [
  { re: /lifted £[\d,]+→£[\d,]+ to the engine corpus|corpus (?:p25|median)/i,
    rule: { rule: 'corpus-median-lift', file: 'scripts/requirements_bom.py', fn: '_corpus_median_lift',
            fix_hint: 'a commodity lifted to a large-component corpus reference — tighten the lift eligibility (class-mismatch guard)' } },
  { re: /capped to pack micro-commodity ceiling|micro-commodity/i,
    rule: { rule: 'pack-micro-commodity-band', file: 'scripts/requirements_bom.py', fn: '_PACK_MICRO_COMMODITY_RE / _PACK_MICRO_{FLOOR,CEILING}_GBP',
            fix_hint: 'a per-cell stamped/wire/pad part — adjust the £3 floor / £12 ceiling or the noun matcher' } },
  { re: /floored to min credible price|floored to m/i,
    rule: { rule: 'price-floor', file: 'scripts/requirements_bom.py', fn: '_price_floor_for / _MIN_PRICE_FLOORS',
            fix_hint: 'a floor (switchgear/process) is overriding a correct low estimate — narrow the floor regex or exempt the noun' } },
  { re: /rating-based|× £[\d,]+\/k(?:W|VA)|£\/k(?:W|VA)/i,
    rule: { rule: 'rating-based-pricing', file: 'scripts/requirements_bom.py', fn: '_rating_kw / rating-based price',
            fix_hint: 'a value read as kW/kVA — verify _rating_kw honours the modifier unit (flow/current/voltage are not power)' } },
  { re: /six-tenths|cost-capacity rule/i,
    rule: { rule: 'six-tenths-scaler', file: 'scripts/requirements_bom.py', fn: 'six-tenths cost-capacity scaler',
            fix_hint: 'a scaled price off a reference duty — check the reference duty + exponent' } },
  { re: /capped at [\d.]+× list|commodity (?:ceiling|cap)/i,
    rule: { rule: 'commodity-ceiling', file: 'scripts/requirements_bom.py', fn: '_apply_commodity_ceiling / _bare_commodity_ceiling',
            fix_hint: 'a catalogue commodity cap — adjust the cap multiple or the commodity noun set' } },
  { re: /materials? take-?off|hoop|wall .*P·r|bottom-up parametric/i,
    rule: { rule: 'materials-takeoff', file: 'scripts/requirements_bom.py', fn: '_materials_takeoff',
            fix_hint: 'a £/kg material take-off — check the dimension/volume it reads + the typed service (structural vs pressure vessel)' } },
  { re: /pipe £[\d.]+\/m|DN\d+|connection:|cable .*mm²/i,
    rule: { rule: 'connection-sizing', file: 'scripts/requirements_bom.py', fn: '_connection_rows / _edge_water_flow_m3h',
            fix_hint: 'a pipe/cable run — check the per-edge duty + DN/CSA sizing' } },
  { re: /parametric/i,
    rule: { rule: 'unit-operation-parametric', file: 'scripts/requirements_bom.py', fn: '_unit_operation_price',
            fix_hint: 'a per-unit-operation parametric — check the duty key + the £/duty coefficient' } },
  { re: /installed instrument|catalogue-class budget/i,
    rule: { rule: 'instrument-synthesis', file: 'scripts/requirements_bom.py', fn: '_child_price (instrument)',
            fix_hint: 'a synthesised field instrument — check the installed-cost estimate' } },
  { re: /catalogue/i,
    rule: { rule: 'catalogue-price', file: 'src/lib/pdf-engine-v2/lib/distributors/db-only-cascade.ts', fn: 'lookupCached (distributor cascade)',
            fix_hint: 'a catalogue/distributor price — a REEL/SHEET price may be applied per-unit (pack-size error) or the part is mis-pinned' } },
]

/** Map a BoM line's `basis` provenance string to the source RULE that produced it. Pure. */
export function sourceRuleForBasis(basis: string): SourceRule | null {
  const b = String(basis || '')
  for (const { re, rule } of SOURCE_RULES) if (re.test(b)) return rule
  return null
}

/** Attach the source rule to each fault by matching it back to its BoM line's basis. Pure.
 *  BRIEF-PIN DOWNGRADE (2026-07-02): a SIZING fault that targets a brief-pinned volume (the
 *  v56 "TK-108 3.7 m dia ≈40 m³ grossly oversized" faults — the brief mandates 3× 40 m³
 *  tanks) is the engine DELIVERING the brief, not a wrong rule. Such a fault is downgraded
 *  to dimension 'note' with brief_pinned=true so the punch-list renders it as informational
 *  ("brief-mandated; benchmark envelope assumes X") — the source rule stays attached as
 *  provenance, but the issue text says plainly that no fix is required. */
export function routeFaults(faults: Fault[], state: any): Array<Fault & { source: SourceRule | null; basis: string; brief_pinned?: boolean }> {
  const rb: any[] = Array.isArray(state?.requirementsBom) ? state.requirementsBom : []
  const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const pinned = briefPinnedVolumesM3(state)
  const pinItems = pinned.pins.flatMap(p => p.item_m3)
  const pinLabel = pinned.pins.map(p => p.label || p.key).join(', ')
  return (faults || []).map(f => {
    const key = norm(f.line)
    // match the fault's line to a BoM row by tag, then by requirement-name containment
    let line = rb.find(r => key && norm(r.tag) === key)
      || rb.find(r => key && (norm(r.requirement).includes(key) || key.includes(norm(r.requirement).split(' ').slice(0, 3).join(' '))))
      || rb.find(r => key && norm(r.requirement).startsWith(key.split(' ').slice(0, 2).join(' ')))
    // MULTI-TAG FAULT LINES (gate-36 round 2): the diagnose LLM often names a FAMILY of
    // lines in one fault ("C59, C05, C23, C29, C07 … (all ~60 water-connection lines)" /
    // "C51–C73 (electrical connections)") — the whole string matches no row, so the fault
    // used to land UNROUTED with basis '—' and no source rule. Route it by its FIRST tag
    // token (the family shares one pricing rule, so any member's basis is the provenance).
    if (!line && key) {
      const firstTok = norm(String(f.line).split(/[,;(]|\s+and\s+|…|–|–/)[0])
      if (firstTok && firstTok !== key) {
        line = rb.find(r => norm(r.tag) === firstTok)
          || rb.find(r => norm(r.requirement).includes(firstTok))
      }
    }
    const basis = line ? String(line.basis || '') : ''
    const routed: Fault & { source: SourceRule | null; basis: string; brief_pinned?: boolean } =
      { ...f, basis, source: basis ? sourceRuleForBasis(basis) : null }
    // brief-pin check: a sizing fault whose implied volume matches a pinned item (±25%) —
    // read the volume from the fault's own text AND from the matched line's shell spec.
    if (pinItems.length && /sizing/i.test(String(f.dimension || ''))) {
      const cand: number[] = []
      // number pattern tolerates thousand separators ("2 031 m³", "2,031 m³", narrow NBSP) so a
      // separated thousands group is never misread as a small pinned-size match ("031" ≠ 31 m³)
      for (const m of `${f.issue || ''} ${f.magnitude || ''}`.matchAll(/(\d{1,3}(?:[,\s  ]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*m(?:³|3)(?!\s*\/)(?!\d)/g)) {
        cand.push(parseFloat(m[1].replace(/[,\s  ]/g, '')))
      }
      const dia = Number(line?.diameter_m), ht = Number(line?.height_m)
      if (dia > 0 && ht > 0) cand.push(Math.PI * (dia / 2) ** 2 * ht)
      const isPinned = cand.some(v => pinItems.some(p => v >= p * 0.75 && v <= p * 1.25))
      if (isPinned) {
        routed.brief_pinned = true
        routed.dimension = 'note'
        routed.issue = `brief-mandated size — ${pinLabel} pins this volume; the benchmark envelope simply assumes `
          + `smaller storage. Not an engine fault. (was: ${f.issue})`
      }
    }
    // INSTALLED-vs-COMPONENT downgrade (gate-36 round 2): a COST fault on a routed
    // connection run whose basis STATES the installed scope (supply + install: pipe/cable +
    // fittings/supports/jointing + labour + terminations) but whose complaint compares it to
    // bare-component prices (fittings £50-150, terminations £15-40) is comparing two
    // different scopes — the benchmark priced the FITTING, the engine priced the INSTALLED
    // RUN. Downgrade to an informational note (the basis is defensible engineering, stated
    // on the line); a cost fault on a connection whose basis does NOT state installed scope
    // still routes as a real fault.
    if (!routed.brief_pinned && /cost/i.test(String(f.dimension || ''))
      && routed.source?.rule === 'connection-sizing'
      && /supply\s*\+\s*install|installed/i.test(basis)
      && /fitting|termination|bare|per\s+(cable|connection|valve)|absorb/i.test(`${f.issue || ''} ${f.suggested || ''}`)) {
      ;(routed as any).installed_basis = true
      routed.dimension = 'note'
      routed.issue = `installed-cost basis stated — the line price is the INSTALLED run (supply + installation `
        + `labour + fittings/supports + terminations, per the line's basis), while the benchmark compared `
        + `bare-component prices. Not an engine fault. (was: ${f.issue})`
    }
    return routed
  })
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
  // classify boundaries (WARN tightened to 1.2× = a 20% delta is actionable, Tristan 2026-06-25)
  if (classify(2.6) !== 'radical' || classify(1.8) !== 'warn' || classify(1.3) !== 'warn' ||
      classify(1.1) !== 'ok' || classify(1 / 1.25) !== 'warn' || classify(1 / 2.6) !== 'radical') {
    console.log('FAIL: classify boundaries'); bad++
  }
  // OUTPUT DIFF (Tristan 2026-06-25 "is the check actually working?") — the net must diff EVERY
  // predicted output against the contract by NAME + UNIT-FAMILY, not one headline by unit-string.
  if (canonicalMeasure(5, 'MWh')?.v !== 5000 || canonicalMeasure(5000, 'kWh')?.v !== 5000) { console.log('FAIL: energy unit-family canonicalise'); bad++ }
  if (canonicalMeasure(2.5, 'MW')?.v !== 2500 || canonicalMeasure(0.86, 'ratio')?.v !== 86) { console.log('FAIL: power/ratio canonicalise'); bad++ }
  {
    const qs = { nameplate_capacity_kwh: { value: 2912, unit: 'kWh' }, continuous_power_kw: { value: 1000, unit: 'kW' }, peak_power_kw: { value: 1250, unit: 'kW' } }
    // a 5,000 kWh / 2.5 MW brief vs a 2,912 kWh / 1 MW design — both must be FOUND and diverge
    const nm = engineValueForMetric('nameplate_capacity_kwh', 'kWh', qs as any, {})
    const pw = engineValueForMetric('rated_power_kw', 'kW', qs as any, {})   // finds continuous_power_kw, not peak
    if (!nm || nm.v !== 2912) { console.log(`FAIL: output match nameplate (got ${JSON.stringify(nm)})`); bad++ }
    if (!pw || pw.v !== 1000 || pw.source !== 'contract.continuous_power_kw') { console.log(`FAIL: output match power → continuous (got ${JSON.stringify(pw)})`); bad++ }
    const rep = compareToBenchmark({ expected_cost: { low_gbp: 0, expected_gbp: 0, high_gbp: 0 } as any, expected_outputs: [{ metric: 'rated_power_kw', value: 2500, unit: 'kW' }], expected_bom: [], required_components: [], expected_sizing: {} as any, reasoning: '', model: 't' } as any, { orchestratorContract: { quantities: qs } })
    if (rep.worst !== 'radical') { console.log(`FAIL: 1 MW vs 2.5 MW must be RADICAL (got ${rep.worst})`); bad++ }
  }
  // SOURCE-RULE ROUTING — each basis maps to the exact source RULE (fix the source, never the symptom)
  if (sourceRuleForBasis('rating-based: 150 kW × £700/kW')?.rule !== 'rating-based-pricing') { console.log('FAIL: rating basis → rating-based-pricing'); bad++ }
  if (sourceRuleForBasis('catalogue · lifted £40→£34,000 to the engine corpus 0.6×median')?.rule !== 'corpus-median-lift') { console.log('FAIL: corpus lift basis → corpus-median-lift'); bad++ }
  if (sourceRuleForBasis('catalogue · floored to min credible price')?.rule !== 'price-floor') { console.log('FAIL: floor basis → price-floor'); bad++ }
  if (sourceRuleForBasis('catalogue · capped to pack micro-commodity ceiling')?.rule !== 'pack-micro-commodity-band') { console.log('FAIL: micro-cap basis → pack-micro-commodity-band'); bad++ }
  if (sourceRuleForBasis('catalogue · MoC: 316L stainless')?.rule !== 'catalogue-price') { console.log('FAIL: plain catalogue → catalogue-price'); bad++ }
  // routeFaults attaches the source by matching the fault back to its BoM line's basis
  const routed = routeFaults(
    [{ line: 'cooling pump', dimension: 'cost', issue: 'too high', magnitude: '30×', suggested: '£3k', likely_cause: 'flow read as kW' }] as any,
    { requirementsBom: [{ tag: 'P-1', requirement: 'cooling pump · 150 L/min', basis: 'rating-based: 150 kW × £700/kW', line_gbp: 210000 }] })
  if (routed[0]?.source?.rule !== 'rating-based-pricing' || routed[0]?.source?.file !== 'scripts/requirements_bom.py') {
    console.log(`FAIL: routeFaults did not route the pump to rating-based-pricing (got ${JSON.stringify(routed[0]?.source)})`); bad++
  }
  // ── VOLUME PARSER RATE-UNIT GUARD + BRIEF-PIN EXEMPTION (2026-07-02, v56) ── proveCatch
  // both directions for each rule.
  // (v1) a FLOW RATE ("· 90 m³/h") must NEVER count as equipment volume — v56 summed 59 pipe
  // duty ratings to a phantom 2,031 m³ (4.23× the envelope) when the true volume sum was 0.
  {
    const r = compareToBenchmark(exp, {
      costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {},
      requirementsBom: [
        { requirement: 'water connection: Sump → Pump · 90 m3/h', line_gbp: 500 },
        { requirement: 'Irrigation Pump · 90 m³/h · 1379x766x1073 mm', line_gbp: 900 },
        { requirement: 'Cloth Filter · 80 m³/h · 3 m² area', line_gbp: 900 },
      ],
    })
    if (r.findings.some(f => f.dimension.startsWith('sizing'))) {
      console.log('FAIL: m³/h flow rates were counted as equipment volume (the v56 2,031 m³ phantom)'); bad++
    }
  }
  // (v2) a TRUE volume line still fires (the guard must not kill the real check) — covered by
  // the 350 m³ case above (r4), which must remain RADICAL.
  // (v3) briefPinnedVolumesM3 reads the v56-shaped brief pin; a m³/h rate metric is NOT a pin.
  const pinnedBrief = {
    parsedBrief: { constraints: { derived_requirements: [
      { key: 'total_water_storage_volume_m3', label: 'Total Water Storage Volume', value: 120, unit: 'm3',
        basis: 'One fresh-water tank (40 m3) plus two drain-water tanks (40 m3 each).' },
      { key: 'total_irrigation_flow_capacity_m3_per_hr', label: 'Total Irrigation Flow Capacity', value: 90, unit: 'm3/h',
        basis: 'Two dosing units, each 45 m3/h.' },
    ] } },
  }
  {
    const p = briefPinnedVolumesM3(pinnedBrief)
    if (p.total_m3 !== 120 || !p.pins[0]?.item_m3.includes(40) || p.pins.length !== 1) {
      console.log(`FAIL: briefPinnedVolumesM3 (want 120 m³ with 40 m³ items, 1 pin; got ${JSON.stringify(p)})`); bad++
    }
  }
  // (v4) total-volume divergence EXPLAINED by the pins → downgraded to an informational note
  // (verdict ok, brief-mandated in the note); the same volumes WITHOUT the pin still flag.
  {
    const bom = [{ requirement: 'Fresh Water Tank · 40 m³', line_gbp: 30000 },
                 { requirement: 'Drain Water Tank · 40 m³', line_gbp: 30000 },
                 { requirement: 'Drain Water Tank 2 · 40 m³', line_gbp: 30000 }]
    const rPin = compareToBenchmark(exp, { ...pinnedBrief, costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {}, requirementsBom: bom })
    const fPin = rPin.findings.find(f => f.dimension === 'sizing — total equipment volume')
    if (!fPin || fPin.verdict !== 'ok' || !/brief-mandated/.test(fPin.note)) {
      console.log(`FAIL: 120 m³ of brief-pinned tanks vs an 86 m³ envelope must downgrade to a note (got ${JSON.stringify(fPin)})`); bad++
    }
    const rNoPin = compareToBenchmark(exp, { costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {}, requirementsBom: bom })
    const fNoPin = rNoPin.findings.find(f => f.dimension === 'sizing — total equipment volume')
    if (!fNoPin || fNoPin.verdict === 'ok') {
      console.log('FAIL: the same 120 m³ WITHOUT a brief pin must still flag (the exemption must not blind the net)'); bad++
    }
  }
  // (v5) residual still RADICAL → still blocks: pins explain only 40 of 300 m³ in an 86 m³
  // envelope (residual 260 m³ ≈ 3× the envelope) — a genuinely oversized non-pinned skid fires.
  {
    const st = {
      parsedBrief: { constraints: { derived_requirements: [
        { key: 'buffer_tank_volume_m3', label: 'Buffer Tank Volume', value: 40, unit: 'm3', basis: 'One 40 m3 buffer tank.' },
      ] } },
      costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {},
      requirementsBom: [{ requirement: 'Buffer Tank · 40 m³', line_gbp: 30000 },
                        { requirement: 'Oversized RO Skid · 260 m³', line_gbp: 90000 }],
    }
    const r = compareToBenchmark(exp, st)
    if (r.worst !== 'radical' || !r.needs_full_check) {
      console.log(`FAIL: a 260 m³ non-pinned residual vs 86 m³ must stay RADICAL and block (got ${r.worst})`); bad++
    }
  }
  // (v6) single-component-vs-enclosure: a brief-pinned 40 m³ tank in a 30 m³ envelope is a
  // note (the benchmark envelope is simply smaller than the mandated storage); a non-pinned
  // 350 m³ skid still fires RADICAL (covered by r4 above).
  {
    const smallEnv: BenchmarkExpectation = { ...exp, expected_sizing: { footprint_m2: 12, volume_m3: 30, envelope: 'small plant room', basis: 't' } }
    const r = compareToBenchmark(smallEnv, { ...pinnedBrief, costStack: { oem_transfer_price_gbp: 1_000_000 }, keyMetrics: {}, requirementsBom: [{ requirement: 'Fresh Water Tank · 40 m³', line_gbp: 30000 }] })
    const f = r.findings.find(x => x.dimension.startsWith('sizing — single'))
    if (!f || f.verdict !== 'ok' || !/brief-mandated/.test(f.note)) {
      console.log(`FAIL: a brief-pinned 40 m³ tank vs a 30 m³ envelope must be a note, not RADICAL (got ${JSON.stringify(f)})`); bad++
    }
  }
  // (v7) routeFaults BRIEF-PIN DOWNGRADE: a per-line sizing fault on the pinned 40 m³ tank
  // (the v56 TK-106/TK-108 punch-list faults) → dimension 'note' + brief_pinned; a sizing
  // fault on a non-pinned skid is untouched (both directions).
  {
    const st = { ...pinnedBrief, requirementsBom: [
      { tag: 'TK-108', requirement: 'Fresh Water Tank · open FRP', basis: 'tapered wall 6 mm = P·r/(σ·E)+c · ⌀3.7×3.7 m', line_gbp: 30000, diameter_m: 3.7, height_m: 3.7 },
      { tag: 'Z-101', requirement: 'Reverse Osmosis Skid', basis: 'bottom-up parametric', line_gbp: 20000 },
    ] }
    const routed = routeFaults([
      { line: 'TK-108 (Fresh Water Tank)', dimension: 'sizing', issue: 'tank grossly oversized for plant room', magnitude: '3.7 m dia (≈40 m³)', suggested: '2.0–2.5 m dia', likely_cause: 'wrong size' },
      { line: 'Z-101 (Reverse Osmosis Skid)', dimension: 'sizing', issue: 'skid oversized', magnitude: '≈300 m³', suggested: 'shrink', likely_cause: 'wrong dims' },
    ] as any, st)
    if (!(routed[0]?.brief_pinned === true && routed[0]?.dimension === 'note' && /brief-mandated/.test(routed[0]?.issue || ''))) {
      console.log(`FAIL: pinned-tank sizing fault not downgraded to a note (got ${JSON.stringify(routed[0])})`); bad++
    }
    if (routed[1]?.brief_pinned || routed[1]?.dimension !== 'sizing') {
      console.log(`FAIL: non-pinned skid sizing fault wrongly downgraded (got ${JSON.stringify(routed[1])})`); bad++
    }
    // thousand-separator guard: "2 031 m³" must parse as 2031 (never "031" ≈ a 40 m³ pin)
    const sep = routeFaults([
      { line: 'all large tanks', dimension: 'sizing', issue: 'cumulative equipment volume 2 031 m³ vs benchmark ~480 m³', magnitude: '~4× over', suggested: 'shrink', likely_cause: 'volume bug' },
    ] as any, st)
    if (sep[0]?.brief_pinned) {
      console.log('FAIL: "2 031 m³" (narrow-space thousands) wrongly pinned to the 40 m³ brief item'); bad++
    }
  }
  // ── GATE-36 ROUND 2 (2026-07-03, v56b) — proveCatch both directions per rule ──
  // (v8) DELIVERED-TOTAL SCOPE PREFERENCE: on a token-overlap tie the diff reads the
  // DELIVERED system total, never a per-scope/per-unit sibling. The v56b shape: 'storage'
  // = 120 m³ matched the FIRST-inserted fresh_water_storage_capacity_m3 = 40 (fresh-only)
  // → a 0.33× false-RADICAL while the delivered 120 m³ sat beside it.
  {
    const qs: any = {
      fresh_water_storage_capacity_m3: { value: 40, unit: 'm3' },
      water_storage_capacity_m3: { value: 120, unit: 'm³' },
      total_water_storage_volume_m3: { value: 261.6, unit: 'm3' },
      water_storage_delivered_m3: { value: 120, unit: 'm3' },
    }
    const got = engineValueForMetric('storage', 'm³', qs, {})
    if (!got || got.v !== 120 || got.source !== 'contract.water_storage_delivered_m3') {
      console.log(`FAIL: 'storage' must match the DELIVERED total (120, water_storage_delivered_m3; got ${JSON.stringify(got)})`); bad++
    }
    // without a delivered key the total/overall roll-up outranks the per-scope sibling
    const qs2: any = { fresh_water_storage_capacity_m3: qs.fresh_water_storage_capacity_m3, total_water_storage_volume_m3: { value: 120, unit: 'm3' } }
    const got2 = engineValueForMetric('storage', 'm³', qs2, {})
    if (!got2 || got2.v !== 120) { console.log(`FAIL: total_* roll-up must outrank the per-scope key (got ${JSON.stringify(got2)})`); bad++ }
    // the fertigation per-unit misread: capacity 90 total, pump 45 per-unit ×2, explicit total 90
    const qs3: any = {
      fertigation_dosing_pump_throughput_m3_h: { value: 45, unit: 'm³/h' },
      fertigation_dosing_pump_count: { value: 2, unit: '' },
      fertigation_dosing_capacity_m3_per_hr: { value: 90, unit: 'm³/h' },
      fertigation_dosing_total_m3_h: { value: 90, unit: 'm3/h' },
    }
    const got3 = engineValueForMetric('fertigation_dosing_capacity', 'm³/h', qs3, {})
    if (!got3 || got3.v !== 90 || got3.source !== 'contract.fertigation_dosing_total_m3_h') {
      console.log(`FAIL: fertigation must match the explicit delivered total 90, never the per-unit 45 (got ${JSON.stringify(got3)})`); bad++
    }
    // counter-direction: a per-share `_per_…_delivered_` key must NOT outrank the system value
    const qs4: any = {
      irrigation_demand_m3_h: { value: 90, unit: 'm³/h' },
      irrigation_per_department_delivered_m3_h: { value: 45, unit: 'm3/h' },
    }
    const got4 = engineValueForMetric('irrigation_capacity', 'm³/h', qs4, {})
    if (!got4 || got4.v !== 90) { console.log(`FAIL: a per-share delivered key must not beat the system value (got ${JSON.stringify(got4)})`); bad++ }
  }
  // (v9) INSTALLED-vs-COMPONENT DOWNGRADE + MULTI-TAG ROUTING: a cost fault comparing an
  // installed connection run to bare-fitting prices downgrades to a note when the basis
  // STATES the installed scope; the same complaint without the stated scope stays a fault;
  // a multi-tag family line ("C59, C05, …") routes by its first tag instead of UNROUTED.
  {
    const st = { requirementsBom: [
      { tag: 'C59', requirement: 'water connection: Uf Module Bank → Fresh Water Tank · 5 m3/h',
        basis: 'pipe £36/m @ DN32 (HDPE/PVC-U) × 22.1 m + 2 ends · installed cost — supply + installation labour + terminations included', line_gbp: 975 },
      { tag: 'C60', requirement: 'water connection: Pump → Tank · 5 m3/h',
        basis: 'pipe £36/m @ DN32 (HDPE/PVC-U) × 10 m + 2 ends', line_gbp: 500 },
    ] }
    const routed = routeFaults([
      { line: 'C59, C05, C23 … (all ~60 water-connection lines)', dimension: 'cost',
        issue: 'Individual pipe runs priced £900–£2400 each; realistic small-bore irrigation fittings are £50–£150',
        magnitude: '~10-20× too high per line', suggested: '£80–£150 per connection', likely_cause: 'overpriced fittings' },
      { line: 'C60', dimension: 'cost',
        issue: 'pipe run priced £500; realistic fittings are £50–£150', magnitude: '~4×', suggested: '£100', likely_cause: 'overpriced' },
    ] as any, st)
    if (!((routed[0] as any)?.installed_basis === true && routed[0]?.dimension === 'note'
      && /installed-cost basis stated/.test(routed[0]?.issue || '') && routed[0]?.source?.rule === 'connection-sizing')) {
      console.log(`FAIL: installed-scope connection cost fault not downgraded (got ${JSON.stringify(routed[0])})`); bad++
    }
    if ((routed[1] as any)?.installed_basis || routed[1]?.dimension !== 'cost') {
      console.log(`FAIL: a connection WITHOUT stated installed scope must stay a real cost fault (got ${JSON.stringify(routed[1])})`); bad++
    }
  }
  console.log(bad === 0 ? 'benchmark-expectation selftest: OK' : `benchmark-expectation selftest: ${bad} FAIL`)
  if (bad) process.exit(1)
}

if (process.argv.includes('--selftest')) _selftest()
else if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })
