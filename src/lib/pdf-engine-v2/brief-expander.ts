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

// Best-reasoning model, run ONCE per chain (the result is written to disk +
// reused). Mirrors bootstrap-tool-plan's HARVEST_MODEL deliberately — the brief
// expansion is the hardest single derivation in the pipeline and is cacheable.
const EXPAND_MODEL = 'google/gemini-3.1-pro-preview'
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
        model: EXPAND_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180_000),
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
export async function expandBrief(
  brief: StructuredBriefJSON,
  productClass: string,
  rawBriefText: string,
): Promise<BriefExpansionResult> {
  const prompt = buildExpansionPrompt(brief, productClass, rawBriefText)
  const { parsed, costUsd, error } = await callReasoner(prompt)
  if (error || parsed == null) {
    return { expansion: null, costUsd, error: error ?? 'no completion', model: EXPAND_MODEL }
  }
  const expansion = sanitiseExpansion(parsed)
  if (!expansion) {
    return { expansion: null, costUsd, error: 'expansion failed validation (<2 valid duties)', model: EXPAND_MODEL }
  }
  return { expansion, costUsd, error: null, model: EXPAND_MODEL }
}
