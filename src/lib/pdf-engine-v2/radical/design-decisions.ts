/**
 * @file design-decisions.ts — Surface unresolved engineering conflicts to a
 * human as DESIGN DECISIONS rather than auto-papering over them in a repair
 * loop.
 *
 * Background (Tristan directive 2026-05-15): the Phase 2 repair loop persistently
 * leaves 3-4 gate violations across every cross-class run. The dominant class
 * is `modifier_consistency`: two genuinely different specs on the same word
 * (e.g. cable_gland has dimension="M20" AND dimension="M20 × 1.5 mm cable").
 * The repair LLM cannot pick between them because both are valid engineering
 * choices — the brief simply didn't pre-commit to one. Today the chain treats
 * this as failure (accepted=false, negative score). It SHOULD treat it as
 * a design decision the human picks.
 *
 * This module:
 *   1. Extracts conflicts from a fully-repaired modules array.
 *   2. Sends each to an LLM (Flash-Lite, fast + cheap) which produces a
 *      plain-English explanation + reasoning + recommendation.
 *   3. Returns a list of DesignDecision records the renderer can show on
 *      a standalone "Design Decisions Required" page.
 *
 * Acceptance impact: when only conflict-class violations remain, the run
 * status is `accepted_with_decisions` — PDF renders, design is sound but
 * has explicit human-input gaps that the report names rather than hides.
 */

import type { ModuleSpec } from '../types/module-decomposition'
import { normaliseKind, normaliseModifierValue } from './universal-grammar-gates'

export interface DesignDecisionConflict {
  /** Stable id for cross-referencing — module/sub_module/word/kind. */
  id: string
  module: string
  sub_module_id: string
  word_id: string
  word_name: string
  kind: string                         // e.g. "dimension", "rating_primary"
  conflicting_values: string[]         // raw values as emitted by the LLMs
}

export interface DesignDecision extends DesignDecisionConflict {
  /** Plain-English description of what the conflicting specs mean. */
  explanation: string
  /** Why the choice matters — performance / safety / procurement consequences. */
  why_it_matters: string
  /** Recommended value + reasoning. */
  recommendation: string
  /** The single value the LLM recommends adopting (one of `conflicting_values`). */
  recommended_value: string
  /** LLM model + timestamp for traceability. */
  generated_by: string
  generated_at: string
}

/**
 * Walk every word's modifier_characters and identify duplicate-kind groups
 * whose values are genuinely different (after normalisation). These are the
 * conflicts the repair loop couldn't resolve.
 */
export function findUnresolvedConflicts(modules: ModuleSpec[]): DesignDecisionConflict[] {
  const conflicts: DesignDecisionConflict[] = []
  for (const m of modules ?? []) {
    for (const sm of ((m as any).sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
        // Group by normalised kind; collect normalised-value sets to detect real conflicts
        const byKindRaw = new Map<string, Set<string>>()      // normalised kind → raw values
        const byKindNorm = new Map<string, Set<string>>()     // normalised kind → normalised values
        for (const mc of mods) {
          const k = normaliseKind(String(mc?.kind ?? ''))
          if (!k) continue
          const raw = String(mc?.value ?? '').trim()
          if (!raw) continue
          const norm = normaliseModifierValue(raw)
          if (!byKindRaw.has(k)) { byKindRaw.set(k, new Set()); byKindNorm.set(k, new Set()) }
          byKindRaw.get(k)!.add(raw)
          byKindNorm.get(k)!.add(norm)
        }
        for (const [k, normSet] of byKindNorm) {
          // Only genuine conflicts: >1 normalised value (cosmetic dupes already collapsed by dedupAllModifiers)
          if (normSet.size <= 1) continue
          const rawSet = byKindRaw.get(k)!
          conflicts.push({
            id: `${m.module}::${sm.id}::${w.id ?? '?'}::${k}`,
            module: m.module,
            sub_module_id: sm.id,
            word_id: String(w.id ?? '?'),
            word_name: String(w.name_human ?? w.content_character?.name_human ?? w.id ?? '?'),
            kind: k,
            conflicting_values: Array.from(rawSet),
          })
        }
      }
    }
  }
  return conflicts
}

const EXPLAINER_SYSTEM = `You are a senior hardware engineer reviewing a design that has an unresolved specification choice. The brief was ambiguous OR the design has two valid options for the same attribute, and a human engineer needs to pick. Your job is to explain the choice in plain English so the customer can make a decision.

For each conflict you receive:
  1. EXPLANATION — describe what each value means, in 1-2 sentences. Use plain English. Avoid acronyms unless universally understood.
  2. WHY IT MATTERS — explain the procurement / safety / performance / compliance consequences of picking one vs the other. 1-2 sentences.
  3. RECOMMENDATION — if you can give one, give it with reasoning. State which value you'd pick and why. If both are equally valid for an ambiguous brief, say so and recommend the safer default.

Output JSON ONLY (no preamble, no markdown fences):
{
  "explanation": "...",
  "why_it_matters": "...",
  "recommendation": "...",
  "recommended_value": "<one of the conflicting values, copied verbatim>"
}

Tone: factual, engineering. Address the reader as "you" (the engineer making the decision). Brief but substantive — no marketing fluff. British English.`

/**
 * Ask the LLM to explain + recommend on one conflict.
 *
 * Uses Flash-Lite (Gemini 3.1 Flash-Lite): fast, cheap, deterministic enough
 * for short structured output. Returns null on any failure (transport, parse,
 * empty) — caller falls back to a deterministic stub so the page still
 * surfaces the conflict even if the LLM is unavailable.
 */
export async function explainConflict(
  conflict: DesignDecisionConflict,
  briefText: string | null,
  apiKey: string,
  model: string = 'google/gemini-3.1-flash-lite',
): Promise<DesignDecision | null> {
  const briefHint = briefText
    ? `BRIEF CONTEXT (the original product brief; ambiguous on this attribute):\n${briefText.slice(0, 4000)}\n\n`
    : ''
  const userContent = `${briefHint}CONFLICT:
  Module:       ${conflict.module}
  Sub-module:   ${conflict.sub_module_id}
  Component:    ${conflict.word_name} (id: ${conflict.word_id})
  Attribute:    ${conflict.kind}
  Conflicting values: ${conflict.conflicting_values.map(v => `"${v}"`).join(' AND ')}

The design currently lists ALL of those values as the component's "${conflict.kind}", but only one can be specified per the BoM. Explain what each means, why it matters, and recommend which to pick. Output JSON only.`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2_000,
        messages: [
          { role: 'system', content: EXPLAINER_SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
    })
    if (!response.ok) return null
    const json = await response.json() as any
    const text = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!text) return null
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    let parsed: any
    try { parsed = JSON.parse(cleaned) } catch { return null }
    const explanation = String(parsed.explanation ?? '').trim()
    const why_it_matters = String(parsed.why_it_matters ?? '').trim()
    const recommendation = String(parsed.recommendation ?? '').trim()
    const recommended_value = String(parsed.recommended_value ?? '').trim()
    if (!explanation || !why_it_matters || !recommendation) return null
    // Validate that recommended_value is one of the conflicting values (or close)
    const valid = conflict.conflicting_values.some(v => v === recommended_value)
      || conflict.conflicting_values.some(v => normaliseModifierValue(v) === normaliseModifierValue(recommended_value))
    return {
      ...conflict,
      explanation,
      why_it_matters,
      recommendation,
      recommended_value: valid ? recommended_value : conflict.conflicting_values[0],
      generated_by: model,
      generated_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Resolve all unresolved conflicts in parallel. Returns the LLM-explained
 * decisions; conflicts that fail to be explained get a deterministic stub so
 * the renderer can still surface them.
 */
export async function resolveDesignDecisions(
  modules: ModuleSpec[],
  briefText: string | null,
  apiKey: string,
): Promise<DesignDecision[]> {
  const conflicts = findUnresolvedConflicts(modules)
  if (conflicts.length === 0) return []
  const results = await Promise.all(conflicts.map(c => explainConflict(c, briefText, apiKey)))
  return results.map((r, i) => r ?? {
    ...conflicts[i],
    explanation: `The design has ${conflicts[i].conflicting_values.length} conflicting values for "${conflicts[i].kind}": ${conflicts[i].conflicting_values.map(v => `"${v}"`).join(' AND ')}. The engine could not auto-resolve.`,
    why_it_matters: 'The Bill of Materials cannot list two values for the same attribute on the same component; a human engineer must pick one before procurement.',
    recommendation: `Pick one of the listed values. Default to the more specific value if the brief allows: ${conflicts[i].conflicting_values[0]}.`,
    recommended_value: conflicts[i].conflicting_values[0],
    generated_by: 'fallback_stub',
    generated_at: new Date().toISOString(),
  })
}
