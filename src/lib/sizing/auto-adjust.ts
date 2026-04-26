/**
 * @file auto-adjust.ts — Brief auto-adjustment when sizing returns INFEASIBLE.
 *
 * @description Tristan-directed 2026-04-26 NIGHT (Loop 8 Tier 1). Today the
 * engine ships a 95-117 page "your design doesn't fit" report when the
 * brief and the constraints can't coexist. The right behaviour: the
 * engine should detect INFEASIBLE, pick the smallest-delta adjustment
 * from `dimension_sheet.recommendations`, apply it to the targets, and
 * re-run sizing. Up to 2 auto-adjustments per project. If still
 * infeasible after 2, the engine ships an honest "fundamentally
 * infeasible" verdict instead of pretending.
 *
 * @architecture (option A: auto-adjust + retry, no UI pause)
 *   1. Sizing produces dimension_sheet
 *   2. If feasible=true → no-op, return as-is
 *   3. If feasible=false AND auto_adjustments.length < 2:
 *      a. If dimension_sheet.closest_feasible_alternate is populated, use it directly
 *      b. Else parse first recommendation via one Sonnet call (~£0.01)
 *      c. Apply structured adjustment to sheet.target
 *      d. Append to research._brief_auto_adjustments[]
 *      e. Return { reRun: true, adjustedTarget }
 *   4. If feasible=false AND auto_adjustments.length >= 2:
 *      → Return { reRun: false, terminal: true } so the caller stops
 *
 * The audit trail in research._brief_auto_adjustments shows each
 * adjustment with its from/to/reason so the cover banner can render it.
 */

import { callOpenRouter } from "@/lib/ai/openrouter"
import type { DimensionSheet, Envelope } from "./types"

export interface BriefAutoAdjustment {
    /** ISO timestamp this adjustment was applied. */
    appliedAtIso: string
    /** Target field that was changed (e.g. "kwh", "kw", "tiers"). */
    field: string
    /** Original value (number or string). */
    fromValue: number | string
    /** New value (number or string). */
    toValue: number | string
    /** Human-readable reason from the sizing recommendation. */
    reason: string
    /** Recommendation text the adjustment was parsed from. */
    sourceRecommendation: string
}

export interface AutoAdjustResult {
    /** True when caller should re-run sizing with the adjusted targets. */
    reRun: boolean
    /** When reRun=true, the target dict to use for the next sizing pass. */
    adjustedTarget?: Record<string, number | string>
    /** When reRun=true AND the adjustment was an envelope swap (e.g.
     *  closest_feasible_alternate.envelope), the new envelope to feed into
     *  runSizing. Path B (LLM-parsed text) only emits target adjustments
     *  today, so this is closest_feasible_alternate-only for now. */
    adjustedEnvelope?: Envelope
    /** When reRun=false AND terminal=true, the engine should NOT retry — auto-adjust budget exhausted. */
    terminal: boolean
    /** The adjustment record appended to the audit trail (when reRun=true). */
    adjustment?: BriefAutoAdjustment
}

const MAX_AUTO_ADJUSTMENTS = 2

/**
 * Decide whether to auto-adjust + return the new target dict.
 *
 * @param sheet - the just-computed (infeasible) DimensionSheet
 * @param priorAdjustments - history from project.research._brief_auto_adjustments
 * @returns an AutoAdjustResult — caller is responsible for persisting the
 *          adjustment record AND re-running sizing if reRun=true
 */
export async function decideAutoAdjustment(
    sheet: DimensionSheet,
    priorAdjustments: BriefAutoAdjustment[],
): Promise<AutoAdjustResult> {
    if (sheet.feasible) {
        return { reRun: false, terminal: false }
    }
    if (priorAdjustments.length >= MAX_AUTO_ADJUSTMENTS) {
        return { reRun: false, terminal: true }
    }

    // Path A — closest_feasible_alternate is already structured. Use it.
    if (sheet.closest_feasible_alternate) {
        const alt = sheet.closest_feasible_alternate
        const adjustedTarget = { ...alt.target } as Record<string, number | string>

        // Detect what actually changed. The alternate may swap envelope,
        // targets, or both. The audit trail surfaces the dominant change.
        let dominantField = "target"
        let dominantFrom: number | string = ""
        let dominantTo: number | string = ""
        for (const k of Object.keys(adjustedTarget)) {
            const fromV = (sheet.target as Record<string, unknown>)[k]
            const toV = adjustedTarget[k]
            if (
                typeof fromV === "number" &&
                typeof toV === "number" &&
                fromV !== toV
            ) {
                dominantField = k
                dominantFrom = fromV
                dominantTo = toV
            }
        }

        // Envelope swap: if the alternate's envelope kind differs from the
        // current sheet's, the dominant change is the envelope, not a
        // target field. Capture that in the audit record AND propagate
        // adjustedEnvelope so the caller's next runSizing pass actually
        // uses the alternate envelope (not just the same targets).
        let adjustedEnvelope: Envelope | undefined
        if (
            alt.envelope &&
            sheet.envelope &&
            alt.envelope.kind !== sheet.envelope.kind
        ) {
            adjustedEnvelope = alt.envelope as Envelope
            dominantField = "envelope"
            dominantFrom = sheet.envelope.label ?? sheet.envelope.kind
            dominantTo = alt.envelope.label ?? alt.envelope.kind
        }

        return {
            reRun: true,
            adjustedTarget,
            adjustedEnvelope,
            terminal: false,
            adjustment: {
                appliedAtIso: new Date().toISOString(),
                field: dominantField,
                fromValue: dominantFrom,
                toValue: dominantTo,
                reason: alt.delta_from_primary ?? "closest feasible alternate from solver",
                sourceRecommendation: `Used solver's closest_feasible_alternate (envelope: ${alt.envelope.label})`,
            },
        }
    }

    // Path B — no structured alternate. Use Sonnet to parse the first
    // recommendation into a structured target adjustment.
    const recs = sheet.recommendations ?? []
    if (recs.length === 0) {
        return { reRun: false, terminal: true }
    }
    const firstRec = recs[0]
    const target = sheet.target as Record<string, unknown>
    const targetKeys = Object.keys(target)

    const prompt = `You are parsing a sizing solver's recommendation into a structured target adjustment.

Current target dict (ALL numeric values):
${JSON.stringify(target, null, 2)}

Available target keys: ${targetKeys.join(", ")}

Recommendation text: "${firstRec}"

Your job: identify the SINGLE target field this recommendation suggests changing, parse the new value as a number, and return JSON ONLY:

{
  "field": "<one of the available target keys>",
  "newValue": <number>,
  "reason": "<one short sentence why this adjustment was chosen>"
}

If the recommendation can't be reduced to a single numeric target adjustment (e.g. "use a larger container"), return:

{ "field": null, "newValue": null, "reason": "<why not parseable>" }

Output JSON only. No prose, no markdown fences.`

    const result = await callOpenRouter({
        model: "anthropic/claude-sonnet-4-6",
        prompt,
        temperature: 0,
        maxTokens: 256,
        timeoutMs: 30_000,
    })
    if (!result.ok) {
        return { reRun: false, terminal: true }
    }
    let parsed: { field: string | null; newValue: number | null; reason: string }
    try {
        const cleaned = result.text
            .replace(/^```(?:json)?/i, "")
            .replace(/```$/i, "")
            .trim()
        parsed = JSON.parse(cleaned)
    } catch {
        return { reRun: false, terminal: true }
    }
    if (
        !parsed ||
        parsed.field == null ||
        typeof parsed.newValue !== "number" ||
        !Number.isFinite(parsed.newValue) ||
        !targetKeys.includes(parsed.field)
    ) {
        return { reRun: false, terminal: true }
    }

    const fromValue = (target[parsed.field] as number | string) ?? ""
    const adjustedTarget: Record<string, number | string> = {
        ...(target as Record<string, number | string>),
    }
    adjustedTarget[parsed.field] = parsed.newValue

    return {
        reRun: true,
        adjustedTarget,
        terminal: false,
        adjustment: {
            appliedAtIso: new Date().toISOString(),
            field: parsed.field,
            fromValue,
            toValue: parsed.newValue,
            reason: parsed.reason,
            sourceRecommendation: firstRec,
        },
    }
}
