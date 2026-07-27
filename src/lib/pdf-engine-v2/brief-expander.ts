/**
 * @file brief-expander.ts — U6: Universal brief EXPANSION (thin brief → detailed
 *       engineering brief), reasoner-driven, NO curation.
 *
 * Problem (Tristan 2026-06-14): the brief stage was a 7-field scalar null-filler
 * (`augmentBrief`). For UNMAPPED classes (aquaculture_ras, co2_*, saf, dac …) it
 * ran a regex that MIS-FRAMED the product — a kingfish RAS came out as a "316L
 * stainless chemical plant" whose "products" were the WASTE ammonia + the CaCO3
 * buffer, with a PED/ASME-VIII pressure-vessel design life. And nowhere did the
 * chain turn the stated targets into the engineering REQUIREMENTS a designer
 * needs (recirculation flow, oxygen-transfer demand, biofilter/TAN duty, CO2-
 * stripping duty, make-up water, thermal duty …). The "detailed brief" Tristan
 * describes simply did not exist.
 *
 * Solution: `expandBrief()` asks a STRONG REASONER (the same once-per-run cached
 * model as the on-the-fly tool planner) to expand the thin brief into the full
 * quantified duty/requirement set for ANY archetype, from first principles +
 * the stated facts. It also corrects the product identity (what the plant
 * PRODUCES) and the construction materials. Every line is provenance-tagged
 * `stated` vs `derived` with the derivation shown.
 *
 * It is UNIVERSAL by construction — there is no per-class table; the reasoner
 * works the physics out from the brief, exactly as the tool-selection bootstrap
 * does. This is the "remove the curation crutch" principle applied to the brief.
 *
 * GUARDS (load-bearing — read before editing):
 *   1. DUTIES, NOT CAPS. The expander derives DEMANDS the design must MEET
 *      (flows, loads, transfer duties). It MUST NOT invent or tighten a cost
 *      ceiling or mass cap — those stay with `augmentBrief`'s conservative path,
 *      because a fabricated tight cap can drive a FALSE compliance PASS (the
 *      "impossible-brief / false-pass" gotcha). A duty only makes the design
 *      bigger/more complete; it can never fake compliance.
 *   2. PROVENANCE. `stated` = lifted verbatim from a brief number; `derived` =
 *      computed by the reasoner (basis shown). Stated brief values are never
 *      contradicted.
 *   3. FEASIBILITY UNTOUCHED. The expander derives what the brief IMPLIES; it
 *      does not invent a feasible target where the brief is infeasible. The
 *      brief-feasibility-gate still judges that downstream.
 *   4. FAIL-SAFE. Any failure (no key, HTTP error, malformed JSON, <2 valid
 *      requirements) returns `expansion:null` + `error` — the caller keeps the
 *      existing `augmentBrief` result and the chain proceeds. The expander can
 *      only ADD signal, never break the run.
 */

import type { StructuredBriefJSON } from './types'
import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

// Best-reasoning model, run ONCE per chain (the result is written to disk +
// reused). Mirrors bootstrap-tool-plan's HARVEST_MODEL deliberately — the brief
// expansion is the hardest single derivation in the pipeline and is cacheable.
// 2026-07-25: repointed off the prior-gen gemini-3.1-pro-preview to grok-4.5 (current
// top reasoner per the 2026-07-24 routing doctrine — strong reasoning + low
// hallucination; gpt-5.6-sol is deeper but its 11% non-hallucination risks inventing
// brief requirements on the single most load-bearing derivation).
const EXPAND_MODEL = 'x-ai/grok-4.5'

// ─── PANEL (Tristan 2026-07-27) ──────────────────────────────────────────────
// "the higher the quality of the information in the brief, the better the output is
// downstream. You can start with a small brief, but it needs to be expanded properly."
// and: "expanded independently [by] three really high-quality briefs and then have one of
// them pick the best parts of the overall brief and actually think about it."
//
// So: three strong reasoners expand the SAME brief INDEPENDENTLY (they never see each
// other's work — independence is the whole point, a panel that has read the first answer
// just ratifies it), then ONE synthesiser reconciles them.
//
// Expensive models are correct HERE specifically: expansion runs ONCE per chain and the
// result is cached to disk by prompt hash, so the cost is paid once per distinct brief
// while every downstream stage inherits the quality. This is the cheapest place in the
// engine to spend money.
const EXPAND_PANEL = [
  'anthropic/claude-fable-5',   // Fable
  'moonshotai/kimi-k3',          // Kimi 3
  'openai/gpt-5.6-sol',          // SOL — the NAMED 5.6 variant, not gpt-5.2
] as const

// THE SYNTHESISER IS NOT A PANEL MEMBER, AND IS DELIBERATELY THE LOW-HALLUCINATION MODEL.
// The note above records why gpt-5.6-sol was rejected as the SINGLE expander: "deeper but
// its 11% non-hallucination risks inventing brief requirements on the single most
// load-bearing derivation". A panel answers that objection for the PRODUCER role — an
// invented duty that appears in only one of three independent expansions is visible as an
// outlier, which is the entire point of fanning out. It does NOT answer it for the
// REDUCER role: a synthesiser that invents can inject a requirement that was in none of
// the three, and nothing downstream would catch it.
//
// So SOL stays a producer and grok-4.5 — the incumbent, chosen on 2026-07-25 for exactly
// this property — does the reduction. It is also the graceful-degradation choice: if the
// whole panel fails, the fallback single-model path is already this model, so a failed
// panel returns the same expansion the engine produced before this change.
const SYNTH_MODEL = EXPAND_MODEL

// The panel members are deep reasoners and the default 180 s cut kimi-k3 off mid-answer on
// the first real run ("The operation was aborted due to timeout"), costing a third of the
// panel's diversity. Expansion is cached, so a slow call is paid once per distinct brief.
const PANEL_TIMEOUT_MS = 600_000
const MAX_OUTPUT_TOKENS = 12_000

export type RequirementProvenance = 'stated' | 'derived'
export type RequirementConfidence = 'high' | 'medium' | 'low'

export type RequirementCategory =
  | 'flow'
  | 'thermal'
  | 'mass_transfer'
  | 'electrical'
  | 'capacity'
  | 'water_quality'
  | 'structural'
  | 'throughput'
  | 'chemical'
  | 'other'

/** One quantified engineering requirement the design must satisfy. */
export interface DerivedRequirement {
  /** canonical snake_case key, e.g. recirculation_flow_m3_per_h */
  key: string
  /** human label, e.g. "Total system recirculation flow" */
  label: string
  /** first-pass quantified estimate; null only when genuinely unquantifiable */
  value: number | null
  /** SI-ish unit string, e.g. "m3/h", "kg/h", "kW", "mg/L" */
  unit: string
  /** the derivation — the actual calculation/reasoning, shown for audit */
  basis: string
  provenance: RequirementProvenance
  confidence: RequirementConfidence
  category: RequirementCategory
}

/** A qualitative operating condition (temperature, pH, salinity, pressure …). */
export interface OperatingCondition {
  key: string
  value: string
  provenance: RequirementProvenance
}

export interface BriefExpansion {
  /** one line: what the plant actually PRODUCES (fixes "ammonia as product") */
  product_summary: string
  /** the saleable output(s), e.g. "yellowtail kingfish (whole, sashimi-grade)" */
  primary_product: string
  /** corrected principal construction materials, e.g. "GRP/HDPE tankage; 316L wetted process parts" */
  construction_materials: string
  /** the quantified duty set the design must meet (the heart of the detailed brief) */
  derived_requirements: DerivedRequirement[]
  /** operating-window conditions (qualitative or range) */
  operating_conditions: OperatingCondition[]
  /** caveats, key assumptions, anything the reasoner is unsure of */
  notes: string
}

export interface BriefExpansionResult {
  expansion: BriefExpansion | null
  costUsd: number | null
  error: string | null
  model: string
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildExpansionPrompt(
  brief: StructuredBriefJSON,
  productClass: string,
  rawBriefText: string,
): string {
  const c = brief.constraints
  const metrics = (c.target_performance?.metrics ?? [])
    .map(m => `  - ${m.key_metric} = ${m.value} ${m.unit} (${m.category}, ${m.source})`)
    .join('\n') || '  (none stated)'
  const addl = (c.additional_constraints ?? [])
    .map(a => `  - ${a.description} (${a.source})`)
    .join('\n') || '  (none stated)'
  const statedProcess = c.target_process?.value ? c.target_process.value : '(not stated)'
  const statedMaterial = c.target_material?.value ? c.target_material.value : '(not stated)'

  return [
    `You are a CHARTERED PRINCIPAL ENGINEER scoping a new-build project. A client has`,
    `given you a THIN brief. Your job is to expand it into the DETAILED ENGINEERING`,
    `BRIEF a competent design team would need before sizing anything — the full set of`,
    `QUANTIFIED DUTIES/REQUIREMENTS the system must satisfy, derived FROM FIRST`,
    `PRINCIPLES and the client's stated targets.`,
    ``,
    `This must work for ANY kind of product or plant. Do NOT assume it is a chemical`,
    `plant. Read what it actually is from the brief. (Example failure to avoid: a`,
    `land-based fish farm is NOT a stainless chemical plant, and the ammonia/CO2 it`,
    `mentions are WASTES to be removed, not saleable products — the product is FISH.)`,
    ``,
    `── THE THIN BRIEF ───────────────────────────────────────────────────────────`,
    `Product class (advisory): ${productClass}`,
    `Product description: ${brief.product_description ?? '(none)'}`,
    `Mission: ${brief.mission_statement ?? '(none)'}`,
    `Stated process: ${statedProcess}`,
    `Stated material (may be wrong/auto-inferred — correct it if so): ${statedMaterial}`,
    `Stated performance metrics:`,
    metrics,
    `Stated additional constraints:`,
    addl,
    `Raw client text:`,
    `"""`,
    (rawBriefText ?? '').slice(0, 6000),
    `"""`,
    ``,
    `── WHAT TO PRODUCE ──────────────────────────────────────────────────────────`,
    `Derive the COMPLETE quantified requirement set. Think across every duty the`,
    `system implies, as applicable to THIS product:`,
    `  • input & output flows / throughputs (mass, volume, items per unit time)`,
    `  • capacities & inventories (volumes, areas, counts, storage)`,
    `  • mass-transfer duties (gas transfer, absorption, stripping, filtration loads)`,
    `  • thermal duties (heating/cooling kW to hold the operating point vs losses)`,
    `  • electrical / power demand (continuous load, peak, voltage class)`,
    `  • water/material quality targets & the removal duty implied to hold them`,
    `  • residence times, turnover rates, recirculation ratios`,
    `  • structural / envelope loads where they drive the design`,
    `  • redundancy / safety-critical demands the brief names`,
    `Derive a FIRST-PASS NUMBER for each from the stated targets (show the`,
    `calculation in "basis"). It is the design team's starting point, not the final`,
    `sized value — be defensible, not precise. Prefer SI units.`,
    ``,
    `HARD RULES:`,
    `  1. DUTIES, NOT CAPS. Never invent or tighten a COST CEILING or a MASS CAP.`,
    `     Those are commercial limits, not engineering duties — omit them entirely.`,
    `  2. PROVENANCE. provenance="stated" ONLY when the number is lifted verbatim`,
    `     from the brief; provenance="derived" when you computed it (basis required).`,
    `  3. Do NOT contradict a stated brief number. Do NOT fabricate feasibility.`,
    `  4. If a duty is genuinely unquantifiable from the brief, set value=null and`,
    `     explain in basis — do not guess wildly.`,
    `  5. Correct the product identity and construction materials to what they`,
    `     REALLY are for this product.`,
    ``,
    `── OUTPUT — STRICT JSON ONLY (no prose, no markdown fence) ───────────────────`,
    `{`,
    `  "product_summary": "one line: what this system actually produces/does",`,
    `  "primary_product": "the saleable output(s)",`,
    `  "construction_materials": "the real principal construction materials",`,
    `  "derived_requirements": [`,
    `    {`,
    `      "key": "snake_case_key_with_unit_suffix",`,
    `      "label": "human label",`,
    `      "value": <number or null>,`,
    `      "unit": "m3/h",`,
    `      "basis": "the derivation / calculation",`,
    `      "provenance": "stated" | "derived",`,
    `      "confidence": "high" | "medium" | "low",`,
    `      "category": "flow|thermal|mass_transfer|electrical|capacity|water_quality|structural|throughput|chemical|other"`,
    `    }`,
    `  ],`,
    `  "operating_conditions": [`,
    `    { "key": "water_temperature", "value": "26.4 C", "provenance": "stated" }`,
    `  ],`,
    `  "notes": "key assumptions / caveats"`,
    `}`,
    ``,
    `Aim for 8–20 derived_requirements covering the real duties. Return ONLY the JSON.`,
  ].join('\n')
}

// ─── LLM call (same proven pattern as bootstrap-tool-plan) ────────────────────

async function callReasoner(
  prompt: string,
  model: string = EXPAND_MODEL,
  timeoutMs: number = 180_000,
): Promise<{ parsed: unknown | null; costUsd: number | null; error: string | null }> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  if (!apiKey) return { parsed: null, costUsd: null, error: 'OPENROUTER_API_KEY not set' }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS brief expansion',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      return { parsed: null, costUsd: null, error: `OpenRouter HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }
    }
    const j: any = await res.json()
    const costUsd = typeof j?.usage?.cost === 'number' ? j.usage.cost : null
    const rawContent = j?.choices?.[0]?.message?.content
    if (!rawContent || typeof rawContent !== 'string') {
      return { parsed: null, costUsd, error: `empty completion (finish_reason=${j?.choices?.[0]?.finish_reason ?? '?'})` }
    }
    let cleaned = rawContent.trim()
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) cleaned = fence[1].trim()
    const a = cleaned.indexOf('{')
    const b = cleaned.lastIndexOf('}')
    if (a === -1 || b === -1) return { parsed: null, costUsd, error: 'no JSON object in completion' }
    try {
      return { parsed: JSON.parse(cleaned.slice(a, b + 1)), costUsd, error: null }
    } catch (err) {
      return { parsed: null, costUsd, error: `JSON parse failed: ${(err as Error).message}` }
    }
  } catch (err) {
    return { parsed: null, costUsd: null, error: `OpenRouter call failed: ${(err as Error).message}` }
  }
}

// ─── Validation / sanitisation ────────────────────────────────────────────────

const VALID_PROVENANCE = new Set<RequirementProvenance>(['stated', 'derived'])
const VALID_CONFIDENCE = new Set<RequirementConfidence>(['high', 'medium', 'low'])
const VALID_CATEGORY = new Set<RequirementCategory>([
  'flow', 'thermal', 'mass_transfer', 'electrical', 'capacity',
  'water_quality', 'structural', 'throughput', 'chemical', 'other',
])

/** Coerce one raw requirement entry; returns null if unusable. */
function sanitiseRequirement(raw: any): DerivedRequirement | null {
  if (!raw || typeof raw !== 'object') return null
  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!key || !label) return null
  // value: a finite number, or explicit null (unquantifiable). Reject NaN/strings.
  let value: number | null = null
  if (raw.value === null || raw.value === undefined) {
    value = null
  } else if (typeof raw.value === 'number' && Number.isFinite(raw.value)) {
    value = raw.value
  } else if (typeof raw.value === 'string' && raw.value.trim() !== '' && Number.isFinite(Number(raw.value))) {
    value = Number(raw.value)
  } else {
    // a non-numeric, non-null value is malformed — keep the requirement but null the number
    value = null
  }
  const provenance: RequirementProvenance =
    VALID_PROVENANCE.has(raw.provenance) ? raw.provenance : 'derived'
  const confidence: RequirementConfidence =
    VALID_CONFIDENCE.has(raw.confidence) ? raw.confidence : 'medium'
  const category: RequirementCategory =
    VALID_CATEGORY.has(raw.category) ? raw.category : 'other'
  return {
    key,
    label,
    value,
    unit: typeof raw.unit === 'string' ? raw.unit.trim() : '',
    basis: typeof raw.basis === 'string' ? raw.basis.trim() : '',
    provenance,
    confidence,
    category,
  }
}

/**
 * GUARD 1 enforcement: drop any requirement that is actually a cost ceiling or a
 * mass cap. Those are commercial caps that must not be fabricated as duties (a
 * fabricated tight cap can drive a false compliance PASS). Keyword + unit match.
 */
export function isCapNotDuty(r: DerivedRequirement): boolean {
  const k = `${r.key} ${r.label}`.toLowerCase()
  const u = r.unit.toLowerCase()
  const looksCost = /\b(cost|price|ceiling|budget|capex|opex|gbp|usd|eur|£|\$|€)\b/.test(k) ||
    /^(gbp|usd|eur|£|\$|€)/.test(u)
  const looksMassCap = /\b(max|maximum|cap|ceiling|limit)\b/.test(k) && /\bmass\b/.test(k)
  return looksCost || looksMassCap
}

export function sanitiseExpansion(raw: any): BriefExpansion | null {
  if (!raw || typeof raw !== 'object') return null
  const rawReqs: unknown[] = Array.isArray(raw.derived_requirements) ? raw.derived_requirements : []
  const reqs: DerivedRequirement[] = rawReqs
    .map(sanitiseRequirement)
    .filter((r: DerivedRequirement | null): r is DerivedRequirement => r !== null)
    .filter((r: DerivedRequirement) => !isCapNotDuty(r)) // GUARD 1: strip cost/mass caps
  // Need at least 2 real duties or the expansion adds nothing — fail-safe.
  if (reqs.length < 2) return null
  const conds: OperatingCondition[] = (Array.isArray(raw.operating_conditions) ? raw.operating_conditions : [])
    .map((oc: any): OperatingCondition | null => {
      if (!oc || typeof oc !== 'object') return null
      const key = typeof oc.key === 'string' ? oc.key.trim() : ''
      const value = typeof oc.value === 'string' ? oc.value.trim() : (oc.value != null ? String(oc.value) : '')
      if (!key || !value) return null
      return { key, value, provenance: VALID_PROVENANCE.has(oc.provenance) ? oc.provenance : 'derived' }
    })
    .filter((x: OperatingCondition | null): x is OperatingCondition => x !== null)
  return {
    product_summary: typeof raw.product_summary === 'string' ? raw.product_summary.trim() : '',
    primary_product: typeof raw.primary_product === 'string' ? raw.primary_product.trim() : '',
    construction_materials: typeof raw.construction_materials === 'string' ? raw.construction_materials.trim() : '',
    derived_requirements: reqs,
    operating_conditions: conds,
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Expand a thin parsed brief into the detailed engineering requirement set.
 * PURE: does not mutate the brief. The caller decides how to attach the result.
 * Fail-safe: returns expansion:null + error on any failure.
 */
function buildSynthesisPrompt(
  panel: { model: string; expansion: BriefExpansion }[],
  productClass: string,
  rawBriefText: string,
): string {
  const bodies = panel.map((p, i) => `### EXPANSION ${i + 1}\n${JSON.stringify(p.expansion, null, 2)}`).join('\n\n')
  return `You are reconciling ${panel.length} INDEPENDENT expansions of the same engineering brief.
Each was produced without sight of the others. Your job is to produce ONE expansion that is
better than any of them individually.

PRODUCT CLASS: ${productClass}

ORIGINAL BRIEF:
${rawBriefText}

${bodies}

HOW TO RECONCILE — follow these rules exactly:

1. CORROBORATION IS EVIDENCE. A quantified requirement that appears in two or more
   expansions is probably real. One that appears in only ONE expansion is a claim, not a
   fact: keep it ONLY if the original brief supports it, and if you keep it, set its
   confidence to "low". If nothing in the brief supports it, DROP it. Independent
   expanders inventing different numbers is the failure mode this panel exists to catch.
2. NEVER AVERAGE CONFLICTING NUMBERS. If two expansions disagree on a value, choose the
   one the ORIGINAL BRIEF supports, or the one that is physically consistent with the rest
   of the duty set. Averaging two guesses produces a third guess that no one can defend.
3. PROVENANCE IS NOT NEGOTIABLE. A requirement is "stated" ONLY if it is actually in the
   brief text. Anything you inferred is "derived", however obvious it seems.
4. DO NOT PREFER AN ANSWER BECAUSE OF WHO WROTE IT. You have no information about which
   model produced which expansion and must not speculate.
5. ADD NOTHING NEW. You are reconciling, not expanding. If none of the ${panel.length}
   expansions contains a requirement, it does not go in the output. This is the single
   most load-bearing derivation in the pipeline and an invented duty propagates into the
   design, the bill of materials and the costs.
6. In "notes", record every conflict you resolved and why, and list anything you dropped
   for lack of corroboration.

Return ONE JSON object in exactly the same shape as the expansions above. No prose.`
}

export async function expandBrief(
  brief: StructuredBriefJSON,
  productClass: string,
  rawBriefText: string,
): Promise<BriefExpansionResult> {
  const prompt = buildExpansionPrompt(brief, productClass, rawBriefText)
  // CACHE for DETERMINISM: a given brief always yields the IDENTICAL detailed
  // brief on re-run (the prompt deterministically encodes the brief+class+text),
  // so scorecard comparisons are apples-to-apples and the run-to-run duty drift
  // is gone. Skip via CHAIN_NO_BRIEF_CACHE=1.
  const cacheKey = createHash('sha1').update(prompt).digest('hex').slice(0, 16)
  const cacheDir = resolve(homedir(), '.forge-truth', 'brief-expansion-cache')
  const cachePath = resolve(cacheDir, `${cacheKey}.json`)
  if (process.env.CHAIN_NO_BRIEF_CACHE !== '1' && existsSync(cachePath)) {
    try {
      const cachedExpansion = sanitiseExpansion(JSON.parse(readFileSync(cachePath, 'utf-8')))
      if (cachedExpansion) return { expansion: cachedExpansion, costUsd: 0, error: null, model: `${EXPAND_MODEL}+cache` }
    } catch { /* corrupt cache → regenerate */ }
  }
  // PANEL: three independent expansions, then one reconciliation. Disable with
  // CHAIN_BRIEF_PANEL=0 to fall back to the single-model path.
  const panelOn = process.env.CHAIN_BRIEF_PANEL !== '0'
  let expansion: BriefExpansion | null = null
  let costUsd: number | null = null
  let error: string | null = null
  let usedModel = EXPAND_MODEL

  if (panelOn) {
    const results = await Promise.all(
      EXPAND_PANEL.map(async (m) => {
        // ONE retry per member. Observed on the first two real runs: kimi-k3 failed once
        // on timeout and once on truncated JSON ("Expected ',' or ']' ... at position
        // 7308") — transport/format flakes on a long structured answer, not a refusal to
        // do the task. A member lost to a flake costs a third of the panel's diversity,
        // and the whole expansion is cached, so the retry is paid once per distinct brief.
        let r = await callReasoner(prompt, m, PANEL_TIMEOUT_MS)
        let exp = r.parsed == null ? null : sanitiseExpansion(r.parsed)
        if (exp == null) {
          console.error(`[brief-panel] ${m} attempt 1 failed (${r.error ?? 'invalid'}) — retrying once`)
          const r2 = await callReasoner(prompt, m, PANEL_TIMEOUT_MS)
          const exp2 = r2.parsed == null ? null : sanitiseExpansion(r2.parsed)
          if (exp2 != null) { r = r2; exp = exp2 }
          else r = { ...r2, costUsd: (r.costUsd ?? 0) + (r2.costUsd ?? 0) }
        }
        return { model: m, exp, cost: r.costUsd, err: r.error }
      }),
    )
    const panelCost = results.reduce((a, r) => a + (r.cost ?? 0), 0)
    const survivors = results.filter((r) => r.exp != null).map((r) => ({ model: r.model, expansion: r.exp as BriefExpansion }))
    for (const r of results) {
      if (r.exp == null) console.error(`[brief-panel] ${r.model} produced nothing usable: ${r.err ?? 'failed validation'}`)
    }
    console.error(`[brief-panel] ${survivors.length}/${EXPAND_PANEL.length} expansions usable, $${panelCost.toFixed(4)}`)

    if (survivors.length >= 2) {
      const synth = await callReasoner(buildSynthesisPrompt(survivors, productClass, rawBriefText), SYNTH_MODEL, PANEL_TIMEOUT_MS)
      const merged = synth.parsed == null ? null : sanitiseExpansion(synth.parsed)
      costUsd = panelCost + (synth.costUsd ?? 0)
      if (merged) {
        expansion = merged
        usedModel = `panel(${survivors.length})+${SYNTH_MODEL}`
      } else {
        // Synthesis failed — fall back to the RICHEST surviving expansion rather than
        // losing the panel's work entirely. Richest by duty count, which is what
        // sanitiseExpansion already validates on.
        const best = survivors.slice().sort((a, b) => b.expansion.derived_requirements.length - a.expansion.derived_requirements.length)[0]
        expansion = best.expansion
        usedModel = `${best.model}(synthesis-failed)`
        console.error(`[brief-panel] synthesis failed (${synth.error ?? 'invalid'}) — using the richest single expansion`)
      }
    } else if (survivors.length === 1) {
      expansion = survivors[0].expansion
      costUsd = panelCost
      usedModel = `${survivors[0].model}(panel-degraded)`
      console.error('[brief-panel] only one usable expansion — no reconciliation possible')
    } else {
      costUsd = panelCost
      console.error('[brief-panel] whole panel failed — falling back to the single-model path')
    }
  }

  if (expansion == null) {
    const single = await callReasoner(prompt)
    costUsd = (costUsd ?? 0) + (single.costUsd ?? 0)
    error = single.error
    if (error || single.parsed == null) {
      return { expansion: null, costUsd, error: error ?? 'no completion', model: EXPAND_MODEL }
    }
    expansion = sanitiseExpansion(single.parsed)
  }
  if (!expansion) {
    return { expansion: null, costUsd, error: 'expansion failed validation (<2 valid duties)', model: usedModel }
  }
  try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cachePath, JSON.stringify(expansion, null, 2)) } catch { /* non-fatal */ }
  return { expansion, costUsd, error: null, model: usedModel }
}
